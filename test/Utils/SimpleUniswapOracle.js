"use strict";

const { 
	dfn,
	bnMantissa,
	BN,
	uq112
} = require('./JS');
const {
	encodeParameters,
	etherBalance,
	etherUnsigned,
	address
} = require('./Ethereum');

const MockUniswapV2Pair = artifacts.require('MockUniswapV2Pair')
const PriceOracle = artifacts.require('SimpleUniswapOracleHarness')

async function makeMockUniswapV2Pair(opts = {}) {
	const address0 = "0x0000000000000000000000000000000000000000";
	const token0 = opts.token0 || address0;
	const token1 = opts.token1 || address0;
	const uniPair = await MockUniswapV2Pair.new(token0, token1);
	return Object.assign(uniPair, {_token0: token0, _token1: token1,
		_setPrice: async (blockTimestamp, price) => await uniPair.setPrice(new BN(blockTimestamp), uq112(price)),
	});	
}

async function makePriceOracle(opts = {}) {
	const priceOracle = await PriceOracle.new();
	return Object.assign(priceOracle, {
		_initialize: async (unipair, blockTimestamp) => {
			await priceOracle.harnessSetBlockTimestamp(new BN(blockTimestamp));
			return await priceOracle.initialize(unipair.address);
		},
		_getResult: async (unipair, blockTimestamp) => {
			await priceOracle.harnessSetBlockTimestamp(new BN(blockTimestamp));
			let result = await priceOracle.getResult.call(unipair.address);
			result.receipt = await priceOracle.getResult(unipair.address);
			return result;
		},
	});	
}

module.exports = {
	makeMockUniswapV2Pair,
	makePriceOracle,
};
