/**
 * BrowserCraft — Webpack Config
 * Bundles src/client/browser-entry.js → public/bundle.js
 * Handles all Node.js polyfills needed by Prismarine modules in the browser.
 */

const path    = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv?.mode === 'development';

  return {
    entry:  './src/client/browser-entry.js',
    output: {
      path:     path.resolve(__dirname, 'public'),
      filename: 'bundle.js',
      clean:    true, // Automatically clears the public folder before generating a new build
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
      // Generates and injects bundle.js script into the final public/index.html
      new HtmlWebpackPlugin({
        template: './src/client/index.html', // Assumes index.html sits next to your entry file
        // Optional: If you don't have a template file yet, uncomment the line below to let Webpack auto-generate a blank base page
        // title: 'BrowserCraft' 
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
