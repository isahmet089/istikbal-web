const fs = require('fs');
const csv = require('csv-parser');
const Account = require('../models/accountModel');

class CsvService {
  async importAccounts(filePath) {
    const results = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          try {
            for (const account of results) {
              await Account.findOneAndUpdate(
                { username: account.username },
                {
                  username: account.username,
                  password: account.password,
                  status: 'waiting',
                  browserOpen: false
                },
                { upsert: true }
              );
            }
            resolve(results.length);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => reject(error));
    });
  }
}

module.exports = new CsvService(); 