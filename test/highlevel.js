const {
	makeMockUniswapV2Pair,
	makePriceOracle,
} = require('./Utils/SimpleUniswapOracle');
const {
	expectEqual,
	expectAlmostEqualUQ112x112,
	expectRevert,
	uq112,
} = require('./Utils/JS');

require('chai')
	.use(require('chai-as-promised'))
	.should();
  
let MIN_T;

const priceCalculator = {
	lastPrice: null,
	addPrice: (t, price) => {
		priceCalculator.lastPrice = {
			t: t,
			price: price,
			prevPrice: priceCalculator.lastPrice
		}
	},
	calculatePrice: (T, t) => {
		T = T*1; //normalize T
		expect(T).to.be.at.least(MIN_T);
		let priceSum = 0, Tsum = 0;
		priceIt = priceCalculator.lastPrice;
		while (true) {
			expect(priceIt).to.not.be.null;
			let priceT = t - priceIt.t;
			t = priceIt.t;
			Tsum += priceT;
			if (Tsum >= T) {
				priceSum += priceIt.price * (priceT - (Tsum - T));
				break;
			}
			priceSum += priceIt.price * priceT;
			priceIt = priceIt.prevPrice;
		}
		return priceSum / T;
	},
};

let uniPair, uniPairInverted, priceOracle;
async function addPrice(t, price) {
	await uniPair._setPrice(t, price);
	priceCalculator.addPrice(t, price);
}
async function addPriceInverted(t, price) {
	await uniPairInverted._setPrice(t, price);
	priceCalculator.addPrice(t, 1/price);
}

contract('Highlevel Scenario', function (accounts) {
	let root;
	before(async () => {
		root = accounts[0];
		uniPair = await makeMockUniswapV2Pair();
		uniPairInverted = await makeMockUniswapV2Pair();
		priceOracle = await makePriceOracle();
		MIN_T = await priceOracle.MIN_T() * 1;
	});

	describe('scenario', () => {
		before(() => {
			priceCalculator.lastPrice = null;	
		});
		it("initialize", async () => {
			await addPrice(0, 2.9);
			result = await priceOracle._initialize(uniPair, 200);
		});
		it("revert if not ready", async () => {
			await addPrice(500, 3.1);
			await expectRevert(priceOracle._getResult(uniPair, 600), "UniswapOracle: NOT_READY");
		});
		
		[
			{prices: [
					{timestamp: 1000, price: 4.1},
			], t: 1200},
			{prices: [], t: 1400},
			{prices: [], t: 1900},
			{prices: [], t: 2700},
			{prices: [
					{timestamp: 2900, price: 5.1},
			], t: 2900},
			{prices: [
					{timestamp: 3000, price: 4.7},
			], t: 3800},
			{prices: [
					{timestamp: 4000, price: 0.1},
			], t: 4800},
			{prices: [
					{timestamp: 5000, price: 0.16},
					{timestamp: 5100, price: 0.31},
					{timestamp: 5200, price: 0.5},
					{timestamp: 5300, price: 0.11},
					{timestamp: 5400, price: 0.13},
					{timestamp: 5500, price: 0.11},
					{timestamp: 5600, price: 0.45},
					{timestamp: 5700, price: 0.21},
			], t: 5800},
			{prices: [
					{timestamp: 6000, price: 0.16},
					{timestamp: 7100, price: 0.31},
					{timestamp: 8200, price: 0.5},
					{timestamp: 9300, price: 0.11},
					{timestamp: 10400, price: 0.13},
					{timestamp: 11500, price: 0.11},
					{timestamp: 12600, price: 0.45},
					{timestamp: 13700, price: 0.21},
					{timestamp: 14400, price: 0.13},
					{timestamp: 15500, price: 0.11},
					{timestamp: 16600, price: 0.45},
					{timestamp: 17700, price: 0.21},
					{timestamp: 18600, price: 0.45},
					{timestamp: 19700, price: 0.21},
			], t: 20000},
		].forEach((testCase) => {
			it(`getResult for ${JSON.stringify(testCase)}`, async () => {
				for (price of testCase.prices) {
					await addPrice(price.timestamp, price.price);
				}
				result = await priceOracle._getResult(uniPair, testCase.t);
				expectAlmostEqualUQ112x112(result.price, uq112(priceCalculator.calculatePrice(result.T, testCase.t)));
			});
		});
	});
	
});