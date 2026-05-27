import React, { useState, useEffect } from 'react';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import DoctorsManager from './components/DoctorsManager';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [adminTab, setAdminTab] = useState('bookings'); 

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // لو فتح الرابط السرّي الخاص باللوحة (سكرتارية + أطباء معاً)
  if (currentPath === '/clinic-dashboard' || currentPath === '/admin') {
    return (
      <div className="min-h-screen bg-slate-100 font-sans" dir="rtl">
        <nav className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
            <h1 className="text-sm md:text-base font-black text-blue-400 flex items-center gap-2">
              🏥 لوحة تحكم العيادة الموحدة
            </h1>
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setAdminTab('bookings')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  adminTab === 'bookings' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                👩‍⚕️ إدارة الحجوزات (السكرتارية)
              </button>
              <button
                onClick={() => setAdminTab('doctors')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  adminTab === 'doctors' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                👨‍⚕️ إعدادات الأطباء
              </button>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto p-4 md:p-6">
          {adminTab === 'bookings' ? <AdminPanel /> : <DoctorsManager />}
        </div>
      </div>
    );
  }

  // الصفحة الافتراضية للمريض فقط (بدون أي أزرار أو شريط علوي)
  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 flex flex-col justify-center items-center font-sans">
      <div className="w-full max-w-md">
        <BookingForm />
      </div>
      <p className="text-[10px] text-slate-400 mt-6">حقوق الطبع محفوظة © عيادتنا الذكية 2026</p>
    </div>
  );
}