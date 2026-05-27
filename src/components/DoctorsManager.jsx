import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';

// مصفوفة أيام الأسبوع الثابتة
const DAYS_OF_WEEK = [
  { key: 'saturday', label: 'السبت' },
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الإثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' },
];

// الحالة المبدئية الافتراضية لجدول المواعيد بصيغة 12 ساعة
const INITIAL_SCHEDULE = {
  saturday: { enabled: false, from: '01:00 PM', to: '07:00 PM' },
  sunday: { enabled: false, from: '01:00 PM', to: '07:00 PM' },
  monday: { enabled: false, from: '01:00 PM', to: '07:00 PM' },
  tuesday: { enabled: false, from: '01:00 PM', to: '07:00 PM' },
  wednesday: { enabled: false, from: '01:00 PM', to: '07:00 PM' },
  thursday: { enabled: false, from: '01:00 PM', to: '07:00 PM' },
  friday: { enabled: false, from: '01:00 PM', to: '07:00 PM' },
};

export default function DoctorsManager() {
  const [doctors, setDoctors] = useState([]);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  
  // حالة تعديل الطبيب (تحمل الـ ID في وضع التعديل وتكون null في وضع الإضافة)
  const [editingDoctorId, setEditingDoctorId] = useState(null);
  
  // حالة جدول مواعيد العمل الحالي في الفورم
  const [schedule, setSchedule] = useState(INITIAL_SCHEDULE);

  // جلب البيانات اللحظية من الفايربيس
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'doctors'), (snapshot) => {
      setDoctors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // التعامل مع تغيير حالة اليوم أو الأوقات
  const handleScheduleChange = (dayKey, field, value) => {
    setSchedule(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value
      }
    }));
  };

  // تفعيل/إيقاف استقبال الحجوزات لطبيب معين مباشرة في Firestore
  const toggleBookingStatus = async (doctorId, currentStatus) => {
    try {
      // إذا لم يكن الحقل موجوداً مسبقاً نعتبره مغلقاً ونفتحه، أو العكس بشكل آمن
      const nextStatus = currentStatus === undefined ? false : !currentStatus;
      await updateDoc(doc(db, 'doctors', doctorId), {
        isBookingOpen: nextStatus
      });
    } catch (error) {
      console.error("خطأ في تحديث حالة الحجز للدكتور:", error);
      alert("حدث خطأ أثناء تغيير حالة استقبال الحجوزات.");
    }
  };

  // تفعيل وضع التعديل وملء حقول الفورم ببيانات الطبيب المخزنة مسبقاً
  const handleEditClick = (doctor) => {
    setEditingDoctorId(doctor.id);
    setName(doctor.name);
    setSpecialty(doctor.specialty);

    // بناء حالة الجدول من بيانات الفايربيس بشكل آمن
    const loadedSchedule = JSON.parse(JSON.stringify(INITIAL_SCHEDULE));
    if (doctor.schedule) {
      Object.keys(doctor.schedule).forEach(day => {
        if (loadedSchedule[day]) {
          loadedSchedule[day].enabled = true;
          loadedSchedule[day].from = doctor.schedule[day].from || '01:00 PM';
          loadedSchedule[day].to = doctor.schedule[day].to || '07:00 PM';
        }
      });
    }
    setSchedule(loadedSchedule);
    
    // الانتقال لأعلى الصفحة بسلاسة لرؤية الفورم أثناء التعديل
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // إلغاء عملية التعديل وتفريغ الحقول للعودة لوضع الإضافة الافتراضي
  const handleCancelEdit = () => {
    setEditingDoctorId(null);
    setName('');
    setSpecialty('');
    setSchedule(INITIAL_SCHEDULE);
  };

  // معالجة إرسال الفورم (سواء إضافة جديدة أو حفظ تعديلات)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !specialty.trim()) {
      alert("🔒 برجاء ملء اسم الطبيب والتخصص!");
      return;
    }

    // تصفية الأيام التي تم تفعيلها فقط لإرسالها لقاعدة البيانات
    const activeSchedule = {};
    Object.keys(schedule).forEach(day => {
      if (schedule[day].enabled) {
        activeSchedule[day] = {
          from: schedule[day].from,
          to: schedule[day].to
        };
      }
    });

    if (Object.keys(activeSchedule).length === 0) {
      alert("⚠️ برجاء اختيار يوم عمل واحد على الأقل للطبيب!");
      return;
    }

    try {
      if (editingDoctorId) {
        // تحديث مستند طبيب موجود بالفعل (مع الحفاظ على حالة فتح الحجز الحالية دون تصفيرها)
        await updateDoc(doc(db, 'doctors', editingDoctorId), {
          name: name.trim(),
          specialty: specialty.trim(),
          schedule: activeSchedule
        });
        alert("✅ تم تحديث بيانات ومواعيد الطبيب بنجاح!");
      } else {
        // إضافة مستند طبيب جديد تماماً (ويكون استقبال الحجز مفتوح تلقائياً true كقيمة مبدئية)
        await addDoc(collection(db, 'doctors'), {
          name: name.trim(),
          specialty: specialty.trim(),
          schedule: activeSchedule,
          isBookingOpen: true
        });
        alert("✅ تم إضافة الطبيب ومواعيده بنجاح!");
      }
      
      // تفريغ الفورم وإعادة التعيين
      handleCancelEdit();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ البيانات.");
    }
  };

  // حذف طبيب من النظام
  const handleDeleteDoctor = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الطبيب نهائياً؟")) return;
    try {
      await deleteDoc(doc(db, 'doctors', id));
      // لو الدكتور المحذوف هو اللي كان بيتعدل حالياً، نلغي وضع التعديل
      if (editingDoctorId === id) {
        handleCancelEdit();
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* كارت إضافة أو تعديل الطبيب */}
      <div className={`p-6 rounded-3xl border shadow-xs space-y-5 transition-colors duration-300 ${editingDoctorId ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200/60'}`}>
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
          {editingDoctorId ? (
            <>📝 تعديل بيانات ومواعيد الطبيب الحالي</>
          ) : (
            <>➕ إضافة طبيب أو عيادة جديدة للمستشفى</>
          )}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">اسم الطبيب:</label>
              <input type="text" placeholder="مثال: د/ أحمد علي" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"/>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">التخصص / العيادة:</label>
              <input type="text" placeholder="مثال: أطفال / عظام" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"/>
            </div>
          </div>

          {/* قائمة اختيار الأيام والساعات المتطورة */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-700">تحديد أيام وساعات العمل الأسبوعية:</label>
            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 space-y-3">
              {DAYS_OF_WEEK.map(day => (
                <div key={day.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 bg-white rounded-xl border border-slate-100">
                  <label className="flex items-center gap-2 cursor-pointer min-w-25">
                    <input 
                      type="checkbox" 
                      checked={schedule[day.key].enabled} 
                      onChange={(e) => handleScheduleChange(day.key, 'enabled', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-black text-slate-800">{day.label}</span>
                  </label>
                  
                  {schedule[day.key].enabled ? (
                    <div className="flex items-center gap-2 flex-1 justify-end text-xs font-bold text-slate-600">
                      <span>من:</span>
                      <input 
                        type="text" 
                        value={schedule[day.key].from} 
                        onChange={(e) => handleScheduleChange(day.key, 'from', e.target.value)}
                        className="p-1.5 w-24 text-center rounded-lg border border-slate-200 bg-slate-50 focus:ring-1 focus:ring-blue-500 text-[11px] font-black"
                      />
                      <span>إلى:</span>
                      <input 
                        type="text" 
                        value={schedule[day.key].to} 
                        onChange={(e) => handleScheduleChange(day.key, 'to', e.target.value)}
                        className="p-1.5 w-24 text-center rounded-lg border border-slate-200 bg-slate-50 focus:ring-1 focus:ring-blue-500 text-[11px] font-black"
                      />
                    </div>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-400 pl-2">إجازة للعيادة</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className={`px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-md cursor-pointer transition-colors ${editingDoctorId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {editingDoctorId ? 'حفظ التعديلات الحالية' : 'إضافة الآن'}
            </button>
            
            {editingDoctorId && (
              <button type="button" onClick={handleCancelEdit} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black text-xs px-5 py-2.5 rounded-xl transition-colors cursor-pointer">
                إلغاء التعديل
              </button>
            )}
          </div>
        </form>
      </div>

      {/* عرض الأطباء الحاليين بمواعيدهم المنظمة وأزرار التحكم */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-xs space-y-4">
        <h3 className="text-sm font-black text-slate-800">📋 الأطباء الحاليين المسجلين على السيستم</h3>
        <div className="grid grid-cols-1 gap-3">
          {doctors.map(d => {
            // التحقق من حالة فتح الحجز (إذا كانت غير معرفة نعتبرها true افتراضياً)
            const isOpen = d.isBookingOpen !== false;
            
            return (
              <div key={d.id} className={`p-4 border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs transition-colors ${editingDoctorId === d.id ? 'bg-amber-50/20 border-amber-300' : 'bg-slate-50/60 border-slate-200'}`}>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="font-black text-slate-800 text-sm">د / {d.name}</p>
                    {/* شارة حالة الحجز البصرية */}
                    <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${isOpen ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                      {isOpen ? '🟢 الحجز مفتوح للجمهور' : '🔴 الحجز مغلق مؤقتاً'}
                    </span>
                  </div>
                  <p className="text-slate-500 font-bold">🩺 التخصص: {d.specialty}</p>
                  
                  <div className="flex flex-wrap gap-2 pt-1">
                    {d.schedule && Object.keys(d.schedule).length > 0 ? (
                      DAYS_OF_WEEK.map(day => {
                        if (d.schedule[day.key]) {
                          return (
                            <span key={day.key} className="bg-white border border-slate-200 px-2.5 py-1 rounded-xl font-bold text-slate-700 text-[11px] shadow-2xs">
                              {day.label}: <span className="text-blue-600 font-black">{d.schedule[day.key].from}</span> إلى <span className="text-amber-600 font-black">{d.schedule[day.key].to}</span>
                            </span>
                          );
                        }
                        return null;
                      })
                    ) : (
                      <span className="text-slate-400 italic">لم يتم تحديد مواعيد عمل بعد</span>
                    )}
                  </div>
                </div>
                
                {/* قسم أزرار التحكم والـ Toggle المتطور */}
                <div className="flex items-center justify-end gap-3 flex-wrap border-t pt-3 md:border-t-0 md:pt-0 border-slate-200/60">
                  {/* زر التبديل السريع لحالة الحجز الخاص بالدكتور */}
                  <button 
                    type="button" 
                    onClick={() => toggleBookingStatus(d.id, d.isBookingOpen)}
                    className={`px-3 py-1.5 rounded-xl font-black transition-all duration-200 border cursor-pointer ${
                      isOpen 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                        : 'bg-rose-600 hover:bg-rose-700 text-white border-transparent'
                    }`}
                  >
                    {isOpen ? '🔒 إغلاق الحجز الحالي' : '🔓 فتح باب الحجز'}
                  </button>

                  <button type="button" onClick={() => handleEditClick(d)} className="bg-blue-50 text-blue-600 border border-blue-100 font-black px-3 py-1.5 rounded-xl hover:bg-blue-100 cursor-pointer transition-colors">
                    تعديل
                  </button>
                  <button type="button" onClick={() => handleDeleteDoctor(d.id)} className="bg-rose-50 text-rose-600 border border-rose-100 font-black px-3 py-1.5 rounded-xl hover:bg-rose-100 cursor-pointer transition-colors">
                    حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}