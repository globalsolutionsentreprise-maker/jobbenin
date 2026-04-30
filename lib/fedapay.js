const fedapay = require('fedapay');
fedapay.FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY);
fedapay.FedaPay.setEnvironment(process.env.FEDAPAY_ENV || 'sandbox');
module.exports = { FedaPay: fedapay.FedaPay, Transaction: fedapay.Transaction };
