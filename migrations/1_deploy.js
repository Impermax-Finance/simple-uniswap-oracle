const PriceOracle = artifacts.require('SimpleUniswapOracle')

module.exports = async function(deployer) {
	await deployer.deploy(PriceOracle);
}