// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../app');
import chai from 'chai';
import chaiHttp from 'chai-http';
import 'mocha';

chai.use(chaiHttp);
const expect = chai.expect;

describe('Testing guests', () => {
    it('Getting guest 1000 and expecting not found', () => {
        return chai.request(app).get('/guest/1000')
            .then(res => {
                expect(res).to.have.status(404);
                chai.expect(res.text).to.eql("\"Guest not found!\"");
            })
    })
})

describe('Testing Staff', () => {
    it('Checking type of get /staff', async () => {
        const res = await chai.request(app).get('/staff');
        expect(res).to.have.status(200);
        expect(JSON.parse(res.text)).to.be.a('array');
    });
})


