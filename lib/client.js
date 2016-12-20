const fetch = require('node-fetch');
const Mustache = require('mustache');
const fs = require('fs');
const DOMParser = require('xmldom').DOMParser;
const xpath = require('xpath');

const baseURI = 'https://global.americanexpress.com';

class Amex {
    constructor(username, password) {
        this.username = username;
        this.password = password;
    }

    getAccounts() {
        let requestXML = this.getRequestXML();
        let options = {
            method: 'POST',
            body: `PayLoadText=${requestXML}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };
        let self = this;

        return fetch(`${baseURI}/myca/intl/moblclient/emea/ws.do?Face=en_GB`, options)
            .then(response => {
                if (response.ok) {
                    return response.text();
                } else {
                    return Promise.reject(new Error(response.status));
                }
            })
            .then(text => {
                let XML = new DOMParser().parseFromString(text, 'text/xml');
                let status = xpath.select('/XMLResponse/ServiceResponse/Status/text()', XML).toString();

                if (status !== 'success') {
                    return Promise.reject(new Error('Authentication failure'));
                }

                self.securityToken = xpath.select('/XMLResponse/ClientSecurityToken/text()', XML).toString();

                return Promise.resolve();
            });
    }

    getTransactions(cardIndex, billingPeriod=0) {
        let requestXML = this.getStatementRequestXML(cardIndex, billingPeriod);
        let options = {
            method: 'POST',
            body: `PayLoadText=${requestXML}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        return fetch(`${baseURI}/myca/intl/moblclient/emea/ws.do?Face=en_GB`, options)
            .then(response => {
                if (response.ok) {
                    return response.text();
                } else {
                    return Promise.reject(new Error(response.status));
                }
            })
            .then(text => {
                let xml = new DOMParser().parseFromString(text);
                let status = xpath.select('/XMLResponse/ServiceResponse/Status/text()', xml).toString();
                let message = xpath.select('/XMLResponse/ServiceResponse/Message/text()', xml).toString();
                let transactions;

                if (status !== 'success') {
                    return Promise.reject(new Error(message));
                }

                transactions = xpath.select('//Transaction', xml).map(transaction => {
                    return {
                        date: xpath.select('./TransChargeDate/text()', transaction).toString(),
                        description: xpath.select('./TransDesc/text()', transaction).toString(),
                        amount: xpath.select('./TransAmount/text()', transaction).toString()
                    };
                });

                return Promise.resolve(transactions);
            });
    }

    getRequestXML() {
        let requestXML = fs.readFileSync(__dirname + '/data/request.xml', 'utf8');
        let requestData = {
            userID: this.username,
            password: this.password,
            timestamp: Date.now(),
            hardwareID: this.generateHardwareID()
        };

        return Mustache.render(requestXML, requestData);
    }

    getStatementRequestXML(cardIndex, billingPeriod) {
        let requestXML = fs.readFileSync(__dirname + '/data/statement-request.xml', 'utf8');
        let requestData = {
            securityToken: this.securityToken,
            cardIndex: cardIndex,
            billingPeriod: billingPeriod
        };

        return Mustache.render(requestXML, requestData);
    }

    generateHardwareID() {
        let chars = 'abcdefghjkmnpqrstuvwxyz1234567890';

        return (new Array(40).fill('x').map(() => {
            return chars[Math.floor(Math.random() * chars.length)];
        })).join('');
    }
}

module.exports = Amex;
