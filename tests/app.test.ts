// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../app');
import chai from 'chai';
import chaiHttp from 'chai-http';
import 'mocha';

chai.use(chaiHttp);
const expect = chai.expect;

describe('Testing guest', () => {
    it('Getting guest 10000 and expecting not found', () => {
        return chai.request(app.app).get('/guest/10000')
            .then(res => {
                expect(res).to.have.status(404);
                expect(res.text).to.eql("\"Guest not found!\"");
            })
    })
})

describe('Testing Staff', () => {
    it('Checking type of get /staff', async () => {
        const res = await chai.request(app.app).get('/staff');
        expect(res).to.have.status(200);
        expect(JSON.parse(res.text)).to.be.a('array');
    });
    it('Checking type of get /staff/0', async () => {
        const res = await chai.request(app.app).get('/staff/100');
        expect(res).to.have.status(200);
        if (res.text === 'OK') {
            expect(true).to.eql(true);
        } else {
            expect(JSON.parse(res.text)).to.be.a('object');
        }
    });
})

describe('Testing Comparison function for time periods', () => {
    it('Test beforeOrDuringPeriodOfTime("2020-10-22 04:20", "2020-10-22 04:20", "2020-10-22 04:20", "2020-10-22 04:20")', async () => {
        expect(app.beforeOrDuringPeriodOfTime("2020-10-22 04:20", "2020-10-22 04:20", "2020-10-22 04:20", "2020-10-22 04:20")).to.eql(true);
    });
    it('Test beforeOrDuringPeriodOfTime("2020-10-22 03:20", "2020-10-22 04:20", "2020-10-22 05:20", "2020-10-22 06:20")', async () => {
        expect(app.beforeOrDuringPeriodOfTime("2020-10-22 03:20", "2020-10-22 04:20", "2020-10-22 05:20", "2020-10-22 06:20")).to.eql(true);
    });
    it('Test beforeOrDuringPeriodOfTime("2020-10-22 08:20", "2020-10-22 06:20", "2020-10-22 03:20", "2020-10-22 05:20")', async () => {
        expect(app.beforeOrDuringPeriodOfTime("2020-10-22 08:20", "2020-10-22 06:20", "2020-10-22 03:20", "2020-10-22 05:20")).to.eql(false);
    });
})


