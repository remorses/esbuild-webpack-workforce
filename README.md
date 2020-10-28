Esbuild Webpack workforce

-   Take all the imports using esbuild
-   Bundle the node modules changing the entry point to inject in window the main module exports
-   Make a map from import to bundle and global object name
-   Add a function to external that use the same resolver as esbuild and then finds the global object name
