import { defineConfig, transformWithEsbuild } from '../../../PATHWAY-web/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
const app=fileURLToPath(new URL('../../../PATHWAY-master/',import.meta.url));
export default defineConfig({root:here,optimizeDeps:{esbuildOptions:{loader:{'.js':'jsx'}}},resolve:{alias:[
{find:/^react-native$/,replacement:app+'node_modules/react-native-web/dist/index.js'},
{find:/^react-native-svg$/,replacement:app+'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js'},
{find:/^react-native-safe-area-context$/,replacement:here+'safe.jsx'},
{find:/^react$/,replacement:app+'node_modules/react/index.js'},
{find:/^react-dom\/client$/,replacement:app+'node_modules/react-dom/client.js'},
{find:/^\.\/PathwayMark$/,replacement:here+'mark.jsx'}
,{find:/^\.\/Icons$/,replacement:here+'icons.jsx'}
]},plugins:[{name:'jsx',enforce:'pre',transform(code,id){if(id.endsWith('.js')&&!id.includes('node_modules'))return transformWithEsbuild(code,id,{loader:'jsx',jsx:'automatic'});}},{name:'logo',configureServer(s){s.middlewares.use('/logo.png',async(req,res)=>{const fs=await import('node:fs');res.setHeader('Content-Type','image/png');fs.createReadStream(app+'assets/pathway-logo-2026-cutout.png').pipe(res);});}}],server:{host:'127.0.0.1',port:3021,fs:{allow:[here,app]}}});
