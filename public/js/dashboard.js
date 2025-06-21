document.addEventListener('DOMContentLoaded', () => {
    const importBtn = document.getElementById('importBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const accountsTable = document.getElementById('accountsTable');
    const logsList = document.getElementById('logsList');

    // Update data every 10 seconds
    setInterval(updateData, 10000);
    updateData();

    // Button event listeners
    importBtn.addEventListener('click', importAccounts);
    startBtn.addEventListener('click', startAutomation);
    stopBtn.addEventListener('click', stopAutomation);

    async function updateData() {
        await Promise.all([
            updateAccounts(),
            updateLogs(),
            updateHealthStatus()
        ]);
    }

    function formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}s ${mins}dk`;
    }

    async function updateAccounts() {
        try {
            const response = await fetch('/api/accounts');
            const accounts = await response.json();
            
            accountsTable.innerHTML = accounts.map(account => `
                <tr>
                    <td>${account.username}</td>
                    <td>
                        <span class="badge bg-${getStatusColor(account.status)}">
                            ${getStatusText(account.status)}
                        </span>
                    </td>
                    <td>
                        <span class="badge bg-${account.browserOpen ? 'success' : 'secondary'}">
                            ${account.browserOpen ? 'Açık' : 'Kapalı'}
                        </span>
                    </td>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="me-2">
                                <strong>Bugün:</strong> ${formatDuration(account.dailyStats?.totalDuration || 0)}
                            </div>
                            ${account.browserOpen ? `
                                <div class="session-timer" data-username="${account.username}">
                                    <div class="spinner-border spinner-border-sm text-primary me-1" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                    <span class="timer-value">Yükleniyor...</span>
                                </div>
                            ` : ''}
                        </div>
                    </td>
                    <td>${new Date(account.lastUpdated).toLocaleString()}</td>
                    <td>${account.message || '-'}</td>
                    <td>
                        <a href="/calendar/${account.username}" class="btn btn-sm btn-outline-primary">Takvim</a>
                    </td>
                </tr>
            `).join('');

            // Update active session timers
            accounts.forEach(account => {
                if (account.browserOpen) {
                    updateSessionTimer(account.username);
                }
            });
        } catch (error) {
            console.error('Error updating accounts:', error);
        }
    }

    async function updateSessionTimer(username) {
        const timerElement = document.querySelector(`.session-timer[data-username="${username}"] .timer-value`);
        if (!timerElement) return;

        try {
            const response = await fetch(`/api/sessions/${username}`);
            const stats = await response.json();
            
            if (stats.activeSessions > 0) {
                timerElement.textContent = formatDuration(stats.totalDuration);
            } else {
                timerElement.textContent = 'Oturum kapalı';
            }
        } catch (error) {
            console.error('Error updating session timer:', error);
        }
    }

    async function updateLogs() {
        try {
            const response = await fetch('/api/logs');
            const logs = await response.json();
            
            logsList.innerHTML = logs.map(log => `
                <div class="list-group-item">
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1">${log.username}</h6>
                        <small>${new Date(log.timestamp).toLocaleString()}</small>
                    </div>
                    <p class="mb-1">
                        <span class="badge bg-${getStatusColor(log.status)}">
                            ${getStatusText(log.status)}
                        </span>
                        ${log.reason || ''}
                    </p>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error updating logs:', error);
        }
    }

    async function updateHealthStatus() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            
            if (data.success) {
                const healthStatus = data.healthStatus;
                const statusElement = document.getElementById('healthStatus');
                
                if (healthStatus.isRunning) {
                    statusElement.innerHTML = `
                        <span class="badge bg-success">Aktif</span>
                        <br><small>${healthStatus.interval / 60000} dakikada bir kontrol</small>
                    `;
                } else {
                    statusElement.innerHTML = `
                        <span class="badge bg-danger">Pasif</span>
                    `;
                }
            }
        } catch (error) {
            console.error('Error updating health status:', error);
        }
    }

    async function importAccounts() {
        try {
            importBtn.disabled = true;
            const response = await fetch('/api/import', { method: 'POST' });
            const result = await response.json();
            alert(result.message);
            await updateAccounts();
        } catch (error) {
            alert('Error importing accounts: ' + error.message);
        } finally {
            importBtn.disabled = false;
        }
    }

    async function startAutomation() {
        try {
            startBtn.disabled = true;
            const response = await fetch('/api/start', { method: 'POST' });
            const result = await response.json();
            alert(result.message);
        } catch (error) {
            alert('Error starting automation: ' + error.message);
            startBtn.disabled = false;
        }
    }

    async function stopAutomation() {
        try {
            stopBtn.disabled = true;
            const response = await fetch('/api/stop', { method: 'POST' });
            const result = await response.json();
            alert(result.message);
            await updateData();
        } catch (error) {
            alert('Error stopping automation: ' + error.message);
        } finally {
            stopBtn.disabled = false;
            startBtn.disabled = false;
        }
    }

    function getStatusColor(status) {
        switch (status) {
            case 'success':
                return 'success';
            case 'failed':
                return 'danger';
            case 'partial_failed':
                return 'warning';
            case 'waiting':
                return 'secondary';
            default:
                return 'secondary';
        }
    }

    function getStatusText(status) {
        switch (status) {
            case 'success':
                return 'Başarılı';
            case 'failed':
                return 'Başarısız';
            case 'partial_failed':
                return 'Kısmi Başarısız';
            case 'waiting':
                return 'Bekliyor';
            default:
                return status;
        }
    }
}); 