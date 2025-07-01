class AccountManager {
    constructor() {
        this.accounts = [];
        this.selectedAccounts = new Set();
        this.currentAccountId = null;
        this.init();
    }

    init() {
        this.loadAccounts();
        this.setupEventListeners();
        this.setupSearchAndFilters();
    }

    setupEventListeners() {
        // Add account form
        document.getElementById('addAccountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addAccount();
        });

        // Edit account form
        document.getElementById('editAccountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateAccount();
        });

        // Delete confirmation
        document.getElementById('confirmDelete').addEventListener('click', () => {
            this.deleteAccount();
        });

        // Clear filters
        document.getElementById('clearFilters').addEventListener('click', () => {
            this.clearFilters();
        });

        // Select all checkbox
        document.getElementById('selectAll').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        // Bulk operations
        document.getElementById('bulkUpdateBtn').addEventListener('click', () => {
            this.showBulkUpdateModal();
        });

        document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
            this.bulkDelete();
        });

        // Bulk update form
        document.getElementById('bulkUpdateForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.bulkUpdate();
        });
    }

    setupSearchAndFilters() {
        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterAccounts();
        });

        // Status filter
        document.getElementById('statusFilter').addEventListener('change', () => {
            this.filterAccounts();
        });

        // Browser filter
        document.getElementById('browserFilter').addEventListener('change', () => {
            this.filterAccounts();
        });
    }

    async loadAccounts() {
        try {
            const response = await fetch('/api/accounts/crud');
            const data = await response.json();
            
            if (data.success) {
                this.accounts = data.accounts;
                this.renderAccounts();
            } else {
                this.showAlert('Hesaplar yüklenirken hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
            this.showAlert('Hesaplar yüklenirken hata oluştu', 'danger');
        }
    }

    renderAccounts(accountsToRender = this.accounts) {
        const tbody = document.getElementById('accountsTableBody');
        
        if (accountsToRender.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Hesap bulunamadı</td></tr>';
            return;
        }

        tbody.innerHTML = accountsToRender.map(account => `
            <tr>
                <td>
                    <div class="checkbox-wrapper">
                        <input type="checkbox" class="form-check-input account-checkbox" 
                               value="${account._id}" ${this.selectedAccounts.has(account._id) ? 'checked' : ''}>
                    </div>
                </td>
                <td>
                    <div class="fw-bold">${account.username}</div>
                </td>
                <td>
                    <span class="badge ${this.getStatusBadgeClass(account.status)}">${this.getStatusText(account.status)}</span>
                </td>
                <td>
                    <span class="badge ${account.browserOpen ? 'bg-success' : 'bg-secondary'}">
                        ${account.browserOpen ? 'Açık' : 'Kapalı'}
                    </span>
                </td>
                <td>${account.loginTime ? this.formatDate(account.loginTime) : 'Hiç giriş yapmamış'}</td>
                <td>${this.formatDate(account.lastUpdated)}</td>
                <td>
                    <span class="text-muted" title="${account.message || ''}">
                        ${account.message ? (account.message.length > 30 ? account.message.substring(0, 30) + '...' : account.message) : '-'}
                    </span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="accountManager.editAccount('${account._id}')" title="Düzenle">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-warning" onclick="accountManager.toggleStatus('${account._id}')" title="Durum Değiştir">
                            <i class="bi bi-arrow-clockwise"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="accountManager.toggleBrowser('${account._id}')" title="Browser Durumu">
                            <i class="bi bi-browser-chrome"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="accountManager.showDeleteModal('${account._id}', '${account.username}')" title="Sil">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Add event listeners to checkboxes
        document.querySelectorAll('.account-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.toggleAccountSelection(e.target.value, e.target.checked);
            });
        });
    }

    async addAccount() {
        const form = document.getElementById('addAccountForm');
        const formData = new FormData(form);
        const accountData = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/accounts/crud', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(accountData)
            });

            const data = await response.json();

            if (data.success) {
                this.showAlert('Hesap başarıyla eklendi', 'success');
                form.reset();
                bootstrap.Modal.getInstance(document.getElementById('addAccountModal')).hide();
                this.loadAccounts();
            } else {
                this.showAlert(data.error || 'Hesap eklenirken hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error adding account:', error);
            this.showAlert('Hesap eklenirken hata oluştu', 'danger');
        }
    }

    async editAccount(accountId) {
        try {
            const response = await fetch(`/api/accounts/crud/${accountId}`);
            const data = await response.json();

            if (data.success) {
                const account = data.account;
                const form = document.getElementById('editAccountForm');
                
                form.querySelector('[name="accountId"]').value = account._id;
                form.querySelector('[name="username"]').value = account.username;
                form.querySelector('[name="password"]').value = account.password;
                form.querySelector('[name="status"]').value = account.status;
                form.querySelector('[name="message"]').value = account.message || '';

                const modal = new bootstrap.Modal(document.getElementById('editAccountModal'));
                modal.show();
            } else {
                this.showAlert('Hesap bilgileri yüklenirken hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error loading account:', error);
            this.showAlert('Hesap bilgileri yüklenirken hata oluştu', 'danger');
        }
    }

    async updateAccount() {
        const form = document.getElementById('editAccountForm');
        const formData = new FormData(form);
        const accountData = Object.fromEntries(formData.entries());
        const accountId = accountData.accountId;
        delete accountData.accountId;

        try {
            const response = await fetch(`/api/accounts/crud/${accountId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(accountData)
            });

            const data = await response.json();

            if (data.success) {
                this.showAlert('Hesap başarıyla güncellendi', 'success');
                bootstrap.Modal.getInstance(document.getElementById('editAccountModal')).hide();
                this.loadAccounts();
            } else {
                this.showAlert(data.error || 'Hesap güncellenirken hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error updating account:', error);
            this.showAlert('Hesap güncellenirken hata oluştu', 'danger');
        }
    }

    async toggleStatus(accountId) {
        try {
            const response = await fetch(`/api/accounts/crud/${accountId}/toggle-status`, {
                method: 'PATCH'
            });

            const data = await response.json();

            if (data.success) {
                this.showAlert('Hesap durumu güncellendi', 'success');
                this.loadAccounts();
            } else {
                this.showAlert(data.error || 'Durum güncellenirken hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error toggling status:', error);
            this.showAlert('Durum güncellenirken hata oluştu', 'danger');
        }
    }

    async toggleBrowser(accountId) {
        try {
            const response = await fetch(`/api/accounts/crud/${accountId}/toggle-browser`, {
                method: 'PATCH'
            });

            const data = await response.json();

            if (data.success) {
                this.showAlert('Browser durumu güncellendi', 'success');
                this.loadAccounts();
            } else {
                this.showAlert(data.error || 'Browser durumu güncellenirken hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error toggling browser:', error);
            this.showAlert('Browser durumu güncellenirken hata oluştu', 'danger');
        }
    }

    showDeleteModal(accountId, accountName) {
        this.currentAccountId = accountId;
        document.getElementById('deleteAccountName').textContent = accountName;
        const modal = new bootstrap.Modal(document.getElementById('deleteAccountModal'));
        modal.show();
    }

    async deleteAccount() {
        try {
            const response = await fetch(`/api/accounts/crud/${this.currentAccountId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showAlert('Hesap başarıyla silindi', 'success');
                bootstrap.Modal.getInstance(document.getElementById('deleteAccountModal')).hide();
                this.loadAccounts();
            } else {
                this.showAlert(data.error || 'Hesap silinirken hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            this.showAlert('Hesap silinirken hata oluştu', 'danger');
        }
    }

    toggleAccountSelection(accountId, isSelected) {
        if (isSelected) {
            this.selectedAccounts.add(accountId);
        } else {
            this.selectedAccounts.delete(accountId);
        }
        this.updateBulkButtons();
    }

    toggleSelectAll(isSelected) {
        this.selectedAccounts.clear();
        if (isSelected) {
            document.querySelectorAll('.account-checkbox').forEach(checkbox => {
                checkbox.checked = true;
                this.selectedAccounts.add(checkbox.value);
            });
        } else {
            document.querySelectorAll('.account-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
        }
        this.updateBulkButtons();
    }

    updateBulkButtons() {
        const hasSelection = this.selectedAccounts.size > 0;
        document.getElementById('bulkUpdateBtn').style.display = hasSelection ? 'block' : 'none';
        document.getElementById('bulkDeleteBtn').style.display = hasSelection ? 'block' : 'none';
    }

    showBulkUpdateModal() {
        document.getElementById('selectedCount').textContent = this.selectedAccounts.size;
        const modal = new bootstrap.Modal(document.getElementById('bulkUpdateModal'));
        modal.show();
    }

    async bulkUpdate() {
        const form = document.getElementById('bulkUpdateForm');
        const formData = new FormData(form);
        const updateData = Object.fromEntries(formData.entries());
        
        // Remove empty values
        Object.keys(updateData).forEach(key => {
            if (updateData[key] === '') {
                delete updateData[key];
            }
        });

        if (Object.keys(updateData).length === 0) {
            this.showAlert('Güncellenecek alan seçiniz', 'warning');
            return;
        }

        updateData.accountIds = Array.from(this.selectedAccounts);

        try {
            const response = await fetch('/api/accounts/crud/bulk-update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData)
            });

            const data = await response.json();

            if (data.success) {
                this.showAlert(data.message, 'success');
                bootstrap.Modal.getInstance(document.getElementById('bulkUpdateModal')).hide();
                this.selectedAccounts.clear();
                this.loadAccounts();
            } else {
                this.showAlert(data.error || 'Toplu güncelleme sırasında hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error bulk updating:', error);
            this.showAlert('Toplu güncelleme sırasında hata oluştu', 'danger');
        }
    }

    async bulkDelete() {
        if (!confirm(`${this.selectedAccounts.size} hesabı silmek istediğinizden emin misiniz?`)) {
            return;
        }

        try {
            const response = await fetch('/api/accounts/crud/bulk-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    accountIds: Array.from(this.selectedAccounts)
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showAlert(data.message, 'success');
                this.selectedAccounts.clear();
                this.loadAccounts();
            } else {
                this.showAlert(data.error || 'Toplu silme sırasında hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('Error bulk deleting:', error);
            this.showAlert('Toplu silme sırasında hata oluştu', 'danger');
        }
    }

    filterAccounts() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        const browserFilter = document.getElementById('browserFilter').value;

        const filteredAccounts = this.accounts.filter(account => {
            const matchesSearch = !searchTerm || 
                account.username.toLowerCase().includes(searchTerm);

            const matchesStatus = !statusFilter || account.status === statusFilter;
            const matchesBrowser = browserFilter === '' || 
                (browserFilter === 'true' && account.browserOpen) ||
                (browserFilter === 'false' && !account.browserOpen);

            return matchesSearch && matchesStatus && matchesBrowser;
        });

        this.renderAccounts(filteredAccounts);
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('browserFilter').value = '';
        this.renderAccounts();
    }

    getStatusBadgeClass(status) {
        switch (status) {
            case 'success': return 'bg-success';
            case 'failed': return 'bg-danger';
            case 'partial_failed': return 'bg-warning text-dark';
            case 'waiting': return 'bg-secondary';
            default: return 'bg-secondary';
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'success': return 'Başarılı';
            case 'failed': return 'Başarısız';
            case 'partial_failed': return 'Kısmi Başarısız';
            case 'waiting': return 'Bekliyor';
            default: return status;
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showAlert(message, type) {
        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(alertDiv);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// Initialize account manager when page loads
let accountManager;
document.addEventListener('DOMContentLoaded', () => {
    accountManager = new AccountManager();
}); 