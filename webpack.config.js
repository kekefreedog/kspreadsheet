const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

class MyPlugin {
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('MyPlugin', (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: 'MyPlugin',
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
                },
                () => {
                    const fileName = 'index.js';
                    const fileContent = compilation.getAsset(fileName).source;

                    const header = `if (! jSuites && typeof(require) === 'function') {
    var jSuites = require('jsuites');
}

if (! formula && typeof(require) === 'function') {
    var formula = require('@jspreadsheet/formula');
}

;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.jspreadsheet = factory();
}(this, (function () {`;

                    const footer = `    return jspreadsheet;
})));`;

                    compilation.updateAsset(fileName, new compiler.webpack.sources.ConcatSource(header, '\n\n', fileContent, '\n\n', footer));
                }
            );
        });
    }
}

let isProduction = process.env.NODE_ENV === 'production';

const webpack = {
    target: ['web', 'es5'],
    entry: isProduction ? './src/index' : './src/test.js',
    mode: isProduction ? 'production' : 'development',
    externals: {},
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'dist'),
        library: 'jspreadsheet',
        libraryExport: 'default',
    },
    optimization: {
        minimize: true,
    },
    devServer: {
        static: {
            directory: path.join(__dirname, '/public'),
        },
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
        },
        port: 8000,
        host: 'localhost',
        devMiddleware: {
            publicPath: '/',
        },
        hot: 'only',
    },
    plugins: [],
    module: {
        rules: [
            isProduction
                ? {
                      test: /\.js$/,
                      use: [
                          {
                              loader: path.resolve('build.cjs'),
                              options: {},
                          },
                      ],
                  }
                : null,
            {
                test: /\.css$/,
                use: [isProduction ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader'],
            },
        ],
    },
    stats: {
        warnings: false,
    },
};

if (isProduction) {
    webpack.plugins.push(new MyPlugin());
    webpack.plugins.push(
        new MiniCssExtractPlugin({
            filename: 'jspreadsheet.css',
        })
    );
}

module.exports = webpack;
