const Homey = require('homey');
const VwWeconnect = require('../lib/@iobroker/iobroker.vw-connect');
const dottie = require('dottie');
const { sleep, encrypt } = require('../lib/helpers');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log('[Driver] - init', this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);
    }

    brand() {
        'Unknown'
    }

    async onPair(session) {
        session.setHandler('setType', async (data) => {
            this.config = {
                type: data.type
            };

            this.homey.app.log(`[Driver] ${this.id} - got config`, { ...this.config, username: 'LOG', password: 'LOG' });

            return true;
        });

        session.setHandler('login', async (data) => {
            try {
                (this.config.username = data.username),
                    (this.config.password = data.password),
                    this.homey.app.log(`[Driver] ${this.id} - got config`, { ...this.config, username: 'LOG', password: 'LOG' });

                this._weConnectClient = await VwWeconnect({ username: this.config.username, password: this.config.password, type: this.config.type });

                this._weConnectClient.sendEvent('ready');

                return true;
            } catch (error) {
                console.log('err', error);
                throw new Error(this.homey.__('pair.error'));
            }
        });

        session.setHandler('showView', async (view) => {
            if (view === 'loading') {
                await sleep(3000);

                session.nextView();
                return true;
            }

            if (view === 'get_data') {
                this.weConnectData = await waitForResults(this);

                if (!this.weConnectData) {
                    session.showView('login_credentials');
                    return true;
                }

                this.weConnectDataTransformed = dottie.transform(this.weConnectData);
                this.homey.app.log(`[Driver] ${this.id} - weConnectData: `, this.weConnectDataTransformed);

                session.nextView();
                return true;
            }
        });

        session.setHandler('list_devices', async () => {
            try {
                const results = [];
                console.log(this.config);
                const vinArray = Object.keys(this.weConnectData).filter((k) => k.includes('.general.vin'));

                this.homey.app.log(`[Driver] ${this.id} - vinArray: `, vinArray.length);

                for (const vinStr of vinArray) {
                    const vin = vinStr ? vinStr.split('.')[0] : null;

                    this.homey.app.log(`[Driver] ${this.id} - vin: `, vin.substring(0, 5));

                    const carportData = this.weConnectDataTransformed[vin].general.carportData;
                    const model = 'model' in carportData ?  carportData.model : carportData.modelName;
                    const brand = this.brand();

                    results.push({
                        name: `${brand} - ${model}`,
                        data: {
                            id: vin
                        },
                        settings: {
                            ...this.config,
                            username: this.config.username,
                            password: encrypt(this.config.password),
                            pin: this.config.pin,
                            vin: vin
                        }
                    });
                }

                this.homey.app.log(`[Driver] ${this.id} - Found devices - `, results);

                return results;
            } catch (error) {
                console.log(error);
                throw new Error(this.homey.__('pair.error'));
            }
        });

        session.setHandler('pincode', async (pincode) => {
            this.homey.app.log(`[Driver] ${this.id} - pincode - `, pincode);
            this.config.pin = pincode.join('');

            console.log(this.config);

            return true;
        });

        async function waitForResults(ctx, retry = 10) {
            for (let i = 0; i < retry; i++) {
                await sleep(750);
                const weConnectData = ctx._weConnectClient.getState();

                ctx.homey.app.log(`[Driver] ${ctx.id} - ctx._weConnectClient.getState() - try: ${i}`);
                ctx.homey.app.log(`[Driver] ${ctx.id} - info.connection - `, weConnectData['info.connection']);

                if (i === 8 && weConnectData['info.connection']) {
                    return Promise.resolve(weConnectData);
                } else if (retry === 9) {
                    return Promise.resolve(false);
                }
            }

            return Promise.resolve(false);
        }
    }
};
