import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 1. رفع حد التحذير إلى 1000 كيلو بايت لتفادي الإزعاج
    chunkSizeWarningLimit: 1000,
    
    // 2. تقسيم المكتبات الكبيرة يدوياً لتسريع تحميل المتصفح
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'firebase-vendor'; // فصل الفايربيز في ملف لوحده
            }
            return 'vendor'; // باقي المكتبات (مثل ريأكت) في ملف لوحده
          }
        }
      }
    }
  }
})