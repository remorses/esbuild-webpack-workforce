import os from 'os'
export const PACKAGE_NAME = 'esbuild-webpack-workforce'

export const MAX_IO_OPS: number = os.cpus().length * 4


export const JS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])