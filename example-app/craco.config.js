/* craco.config.js */

const { esbuildWorkforce } = require('esbuild-webpack-workforce')

module.exports = async function ({ env }) {
    return {
        webpack: {
            configure: (config, { env }) => {
                console.log(config)
                return esbuildWorkforce({
                    config,
                    auto: true,
                    packages: [require.resolve('cesium')],
                })
            },
        },
    }
}
