import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({plugins:[react(),tailwindcss()],build:{outDir:'tests/visual/dist',rollupOptions:{input:'tests/visual/index.html'}},optimizeDeps:{entries:['tests/visual/index.html']},resolve:{alias:[{find:/.*lib\/supabase$/,replacement:fileURLToPath(new URL('./supabase-mock.ts',import.meta.url))}]},server:{host:'127.0.0.1',port:5180,strictPort:true}});
