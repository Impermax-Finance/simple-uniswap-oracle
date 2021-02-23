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
 
const MIN_T = 1800;

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

contract('Highlevel Scenario', function (accounts) {
	let root;
	before(async () => {
		root = accounts[0];
		uniPair = await makeMockUniswapV2Pair();
		uniPairInverted = await makeMockUniswapV2Pair();
		priceOracle = await makePriceOracle();
	});

	describe('scenario', () => {
		before(() => {
			priceCalculator.lastPrice = null;	
		});
		it("initialize", async () => {
			await addPrice(0, 2.9);
			result = await priceOracle._initialize(uniPair, MIN_T*0.1);
		});
		it("revert if not ready", async () => {
			await addPrice(MIN_T*0.5, 3.1);
			await expectRevert(priceOracle._getResult(uniPair, MIN_T*0.6), "UniswapOracle: NOT_READY");
		});
		
		[
			{prices: [
					{timestamp: MIN_T*1.2, price: 4.1},
			], t: MIN_T*1.3},
			{prices: [], t: MIN_T*1.5},
			{prices: [], t: MIN_T*2.4},
			{prices: [], t: MIN_T*3.9},
			{prices: [
					{timestamp: MIN_T*4.1, price: 5.1},
			], t: MIN_T*5.4},
			{prices: [
					{timestamp: MIN_T*5.5, price: 4.7},
			], t: MIN_T*5.8},
			{prices: [
					{timestamp: MIN_T*6.1, price: 0.1},
			], t: MIN_T*6.3},
			{prices: [
					{timestamp: MIN_T*6.5, price: 0.16},
					{timestamp: MIN_T*6.6, price: 0.31},
					{timestamp: MIN_T*6.7, price: 0.5},
					{timestamp: MIN_T*6.8, price: 0.11},
					{timestamp: MIN_T*7.0, price: 0.13},
					{timestamp: MIN_T*7.2, price: 0.11},
					{timestamp: MIN_T*7.4, price: 0.45},
					{timestamp: MIN_T*7.6, price: 0.21},
			], t: MIN_T*7.8},
			{prices: [
					{timestamp: MIN_T*8.5, price: 0.13},
					{timestamp: MIN_T*9.6, price: 0.11},
					{timestamp: MIN_T*10.6, price: 0.45},
					{timestamp: MIN_T*11.6, price: 0.21},
					{timestamp: MIN_T*14.6, price: 0.45},
					{timestamp: MIN_T*19.6, price: 0.21},
			], t: MIN_T*20},
		].forEach((testCase) => {
			it(`getResult for ${JSON.stringify(testCase)}`, async () => {
				for (price of testCase.prices) {
					await addPrice(Math.round(price.timestamp), price.price);
				}
				result = await priceOracle._getResult(uniPair, testCase.t);
				expectAlmostEqualUQ112x112(result.price, uq112(priceCalculator.calculatePrice(result.T, testCase.t)));
			});
		});
	});
	
});