/**
 * BrowserCraft — Webpack Config
 * Bundles src/client/browser-entry.js → public/bundle.js
 * Handles all Node.js polyfills needed by Prismarine modules in the browser.
 */

const path    = require('path');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isDev = argv?.mode === 'development';

  return {
    entry:  './src/client/browser-entry.js',
    output: {
      path:     path.resolve(__dirname, 'public'),
      filename: 'bundle.js',
    },
    mode:    isDev ? 'development' : 'production',
    devtool: isDev ? 'eval-source-map' : false,

    resolve: {
      fallback: {
        // Node core modules needed by Prismarine in the browser
        buffer:        require.resolve('buffer/'),
        stream:        require.resolve('stream-browserify'),
        crypto:        require.resolve('crypto-browserify'),
        path:          require.resolve('path-browserify'),
        os:            require.resolve('os-browserify/browser'),
        events:        require.resolve('events/'),
        util:          require.resolve('util/'),
        assert:        require.resolve('assert/'),
        net:           false,
        tls:           false,
        fs:            false,
        child_process: false,
        dns:           false,
      },
    },

    plugins: [
      new webpack.ProvidePlugin({
        Buffer:  ['buffer', 'Buffer'],
        process: 'process/browser',
      }),
      new webpack.DefinePlugin({
        'process.env.BROWSER': JSON.stringify(true),
      }),
    ],

    module: {
      rules: [
        {
          test:    /\.js$/,
          exclude: /node_modules/,
          use:     {
            loader:  'babel-loader',
            options: { presets: ['@babel/preset-env'] },
          },
        },
        {
          test: /\.css$/,
          use:  ['style-loader', 'css-loader'],
        },
      ],
    },

    devServer: {
      static:  path.join(__dirname, 'public'),
      port:    8080,
      hot:     true,
      proxy:   [
        { context: ['/api', '/proxy'], target: 'http://localhost:8081', ws: true },
      ],
    },
  };
};
