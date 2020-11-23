const {
	makeMockUniswapV2Pair,
	makePriceOracle,
} = require('./Utils/SimpleUniswapOracle');
const {
	BN,
	expectEqual,
	expectAlmostEqualUQ112x112,
	expectRevert,
	expectEvent,
	uq112
} = require('./Utils/JS');

require('chai')
	.use(require('chai-as-promised'))
	.should();
  
contract('SimpleUniswapOracle', function (accounts) {
	let root;
	let MIN_DELTA;
	before(async () => {
		root = accounts[0];
		const priceOracle = await makePriceOracle();
		MIN_DELTA = await priceOracle.MIN_DELTA() * 1;
	});

	describe('initialize', () => {
		let uniPair, priceOracle;
		const price = 2.23;
		const t = 100;
		beforeEach(async () => {
			uniPair = await makeMockUniswapV2Pair();
			priceOracle = await makePriceOracle();
		});
		it("before initialization everything is 0", async () => {
			const pair = await priceOracle.getPair(uniPair.address);
			expectEqual(pair.priceCumulativeA, 0);
			expectEqual(pair.priceCumulativeB, 0);
			expectEqual(pair.updateA, 0);
			expectEqual(pair.updateB, 0);
			expect(pair.lastIsA).to.be.false;
			expect(pair.initialized).to.be.false;
		});
		it("initialize succeed", async () => {
			await priceOracle.initialize(uniPair.address);
		});
		it("initialize revert if not IUniswapV2Pair", async () => {
			await expectRevert.unspecified(priceOracle.initialize(root));
		});
		it("initialize correctly", async () => {
			await uniPair._setPrice(0, price);
			const expectedPriceCumulative = (await uniPair.price0CumulativeLast()).add(uq112(price*t));
			const receipt = await priceOracle._initialize(uniPair, t);
			const pair = await priceOracle.getPair(uniPair.address);
			expectEqual(pair.updateA, t);
			expectEqual(pair.updateB, t);
			expectAlmostEqualUQ112x112(pair.priceCumulativeA, expectedPriceCumulative);
			expectAlmostEqualUQ112x112(pair.priceCumulativeB, expectedPriceCumulative);
			expect(pair.lastIsA).to.be.true;
			expect(pair.initialized).to.be.true;
			expectEvent(receipt, 'PriceUpdate', {
				pair: uniPair.address,
				priceCumulative: pair.priceCumulativeA,
				blockTimestamp: new BN(t),
				lastIsA: true
			});
		});
		it("getResult fails if MIN_DELTA is not passed since initialization", async () => {
			await priceOracle._initialize(uniPair, 0);
			await expectRevert(priceOracle._getResult(uniPair, MIN_DELTA-1), "UniswapOracle: NOT_READY");			
		});
		it("getResult succeed after MIN_DELTA since initialization", async () => {
			await priceOracle._initialize(uniPair, 0);
			await priceOracle._getResult(uniPair, MIN_DELTA);			
		});
	});
	
	describe('getPriceCumulativeCurrent', () => {
		const priceCumulative = uq112(3796.394);
		const price = 11.34;
		const t = 1234;
		before(async () => {
			uniPair = await makeMockUniswapV2Pair();
			priceOracle = await makePriceOracle();
		});
		it("test priceCumulative", async () => {
			let reserve0 = 1000000;
			let reserve1 = reserve0 * price;
			await uniPair.setPriceComulative0Last(priceCumulative);
			await uniPair.setReserves(reserve0, reserve1, 0);
			await priceOracle.harnessSetBlockTimestamp(0);
			let priceComulativeLast = await priceOracle.getPriceCumulativeCurrentHarness(uniPair.address);
			expectAlmostEqualUQ112x112(priceComulativeLast, priceCumulative);
			await priceOracle.harnessSetBlockTimestamp(t);
			priceComulativeLast = await priceOracle.getPriceCumulativeCurrentHarness(uniPair.address);			
			expectAlmostEqualUQ112x112(priceComulativeLast, priceCumulative.add(uq112(price*t)));		
		});
	});
	
	describe('multiplePairs', () => {
		it("test 2 pairs", async () => {
			const uniPairA = await makeMockUniswapV2Pair();
			const uniPairB = await makeMockUniswapV2Pair();
			const priceOracle = await makePriceOracle();
			await uniPairA._setPrice(0, 1.97);
			await uniPairB._setPrice(0, 0.34);
			await priceOracle._initialize(uniPairA, 0);
			await priceOracle._initialize(uniPairB, 0);
			resultA = await priceOracle._getResult(uniPairA, 1000);
			resultB = await priceOracle._getResult(uniPairB, 1000);
			expectEqual(resultA.T, 1000);
			expectEqual(resultB.T, 1000);
			expectAlmostEqualUQ112x112(resultA.price, uq112(1.97));
			expectAlmostEqualUQ112x112(resultB.price, uq112(0.34));
			await uniPairA._setPrice(1000, 2.04);
			await uniPairB._setPrice(1000, 0.39);
			await uniPairA._setPrice(1500, 2.09);
			await uniPairB._setPrice(1500, 0.31);
			resultA = await priceOracle._getResult(uniPairA, 2000);
			resultB = await priceOracle._getResult(uniPairB, 2000);
			expectEqual(resultA.T, 1000);
			expectEqual(resultB.T, 1000);
			expectAlmostEqualUQ112x112(resultA.price, uq112((2.04+2.09)/2));
			expectAlmostEqualUQ112x112(resultB.price, uq112((0.39+0.31)/2));
		});
	});	
		
	describe('getResult', () => {
		let uniPair, priceOracle;
		const price1 = 2.23;
		const price2 = 3.23;
		beforeEach(async () => {
			uniPair = await makeMockUniswapV2Pair();
			priceOracle = await makePriceOracle();
			await uniPair._setPrice(0, price1);
			await priceOracle._initialize(uniPair, 0);
			await priceOracle._getResult(uniPair, MIN_DELTA);
		});
		it("B to A if T >= MIN_DELTA update price", async () => {
			let T = MIN_DELTA;
			await uniPair._setPrice(MIN_DELTA * 1.5, price2);
			const pairBefore = await priceOracle.getPair(uniPair.address);
			const result = await priceOracle._getResult(uniPair, MIN_DELTA + T);
			const pairAfter = await priceOracle.getPair(uniPair.address);
			const expectedPriceCumulative = pairBefore.priceCumulativeB.add(uq112((price1+price2)*T/2));
			expect(pairBefore.lastIsA).to.be.false;
			expect(pairAfter.lastIsA).to.be.true;
			expectEqual(pairAfter.priceCumulativeB, pairBefore.priceCumulativeB);
			expectEqual(pairAfter.updateB, pairBefore.updateB);
			expectEqual(pairAfter.updateA, MIN_DELTA + T);
			expectAlmostEqualUQ112x112(pairAfter.priceCumulativeA, expectedPriceCumulative);
			expectAlmostEqualUQ112x112(result.price, uq112((price1+price2)/2));
			expectEvent(result.receipt, 'PriceUpdate', {
				pair: uniPair.address,
				priceCumulative: pairAfter.priceCumulativeA,
				blockTimestamp: new BN(MIN_DELTA + T),
				lastIsA: true
			});
		});
		it("B to A if T < MIN_DELTA don't update and use previous priceCumulative", async () => {
			let T = MIN_DELTA - 1;
			await uniPair._setPrice(MIN_DELTA * 1.5, price2);
			const pairBefore = await priceOracle.getPair(uniPair.address);
			const result = await priceOracle._getResult(uniPair, MIN_DELTA + T);
			const pairAfter = await priceOracle.getPair(uniPair.address);
			expect(pairBefore.lastIsA).to.be.false;
			expect(pairAfter.lastIsA).to.be.false;
			expectEqual(pairAfter.priceCumulativeB, pairBefore.priceCumulativeB);
			expectEqual(pairAfter.priceCumulativeA, pairBefore.priceCumulativeA);
			expectEqual(pairAfter.updateB, pairBefore.updateB);
			expectEqual(pairAfter.updateA, pairBefore.updateA);
			expectAlmostEqualUQ112x112(result.price, uq112((price1*MIN_DELTA*1.5+price2*(MIN_DELTA/2-1))/(MIN_DELTA*2-1)));
		});
		it("A to B if T >= MIN_DELTA update price", async () => {
			let T = MIN_DELTA;
			await priceOracle._getResult(uniPair, MIN_DELTA * 2);
			await uniPair._setPrice(MIN_DELTA * 2.5, price2);
			const pairBefore = await priceOracle.getPair(uniPair.address);
			const result = await priceOracle._getResult(uniPair, MIN_DELTA * 2 + T);
			const pairAfter = await priceOracle.getPair(uniPair.address);
			const expectedPriceCumulative = pairBefore.priceCumulativeA.add(uq112((price1+price2)*T/2));
			expect(pairBefore.lastIsA).to.be.true;
			expect(pairAfter.lastIsA).to.be.false;
			expectEqual(pairAfter.priceCumulativeA, pairBefore.priceCumulativeA);
			expectEqual(pairAfter.updateA, pairBefore.updateA);
			expectEqual(pairAfter.updateB, MIN_DELTA * 2 + T);
			expectAlmostEqualUQ112x112(pairAfter.priceCumulativeB, expectedPriceCumulative);
			expectAlmostEqualUQ112x112(result.price, uq112((price1+price2)/2));
			expectEvent(result.receipt, 'PriceUpdate', {
				pair: uniPair.address,
				priceCumulative: pairAfter.priceCumulativeB,
				blockTimestamp: new BN(MIN_DELTA * 2 + T),
				lastIsA: false
			});
		});
		it("A to B if T < MIN_DELTA don't update and use previous priceCumulative", async () => {
			let T = MIN_DELTA - 1;
			await priceOracle._getResult(uniPair, MIN_DELTA * 2);
			await uniPair._setPrice(MIN_DELTA * 2.5, price2);
			const pairBefore = await priceOracle.getPair(uniPair.address);
			const result = await priceOracle._getResult(uniPair, MIN_DELTA * 2 + T);
			const pairAfter = await priceOracle.getPair(uniPair.address);
			expect(pairBefore.lastIsA).to.be.true;
			expect(pairAfter.lastIsA).to.be.true;
			expectEqual(pairAfter.priceCumulativeB, pairBefore.priceCumulativeB);
			expectEqual(pairAfter.priceCumulativeA, pairBefore.priceCumulativeA);
			expectEqual(pairAfter.updateB, pairBefore.updateB);
			expectEqual(pairAfter.updateA, pairBefore.updateA);
			expectAlmostEqualUQ112x112(result.price, uq112((price1*MIN_DELTA*1.5+price2*(MIN_DELTA/2-1))/(MIN_DELTA*2-1)));
		});
	});
});