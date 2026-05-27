import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, runTransaction, query, where, getDocs, deleteDoc } from 'firebase/firestore';

export default function QueueBox() {
  const [doctors, setDoctors] = useState([]); 
  const [selectedDocId, setSelectedDocId] = useState(''); 
  
  // خريطة لتخزين كل بيانات الأطباء بالـ ID لضمان قراءة المواعيد والعدادات لحظياً دون أي أخطاء مسميات
  const [doctorsMap, setDoctorsMap] = useState({});

  // بيانات فورم الحجز الجديد
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  
  // بيانات الاستعلام برقم الموبايل
  const [searchPhone, setSearchPhone] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const [loading, setLoading] = useState(false);

  // الحجز النشط الذي تم العثور عليه للمريض
  const [myActiveBooking, setMyActiveBooking] = useState(null);

  // 1. جلب قائمة الأطباء ومراقبتهم بالكامل لحظياً (الحل الجذري للمواعيد والعدادات)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "doctors"), (snapshot) => {
      const docsList = [];
      const map = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const doctorInfo = { id: docSnap.id, ...data };
        docsList.push(doctorInfo);
        map[docSnap.id] = doctorInfo; // حفظ الطبيب بمفتاح الـ ID بتاعه
      });
      setDoctors(docsList);
      setDoctorsMap(map);
      
      if (docsList.length > 0 && !selectedDocId) {
        setSelectedDocId(docsList[0].id);
      }
    }, (error) => {
      console.error("QueueBox Doctors Listener Error:", error);
    });
    return () => unsubscribe();
  }, []); 

  // 2. تتبع الحجز النشط لحظياً لو تم العثور عليه
  useEffect(() => {
    if (!myActiveBooking?.id) return;

    const bookingRef = doc(db, "bookings", myActiveBooking.id);
    const unsubscribeBooking = onSnapshot(bookingRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // يستمر في العرض طالما لم ينته الكشف (waiting أو inside أو حتى pending مراجعة الدفع)
        if (data.status !== "completed" && data.status !== "cancelled") {
          setMyActiveBooking({ id: snap.id, ...data });
          if (data.doctorId) {
            setSelectedDocId(data.doctorId); // الانتقال التلقائي للـ ID الخاص بدكتور الحجز
          }
        } else {
          setMyActiveBooking(null);
        }
      } else {
        setMyActiveBooking(null);
      }
    });

    return () => unsubscribeBooking();
  }, [myActiveBooking?.id]);

  // 3. دالة الاستعلام والبحث المرنة برقم الموبايل
  const handleSearchBooking = async (e) => {
    e.preventDefault();
    if (!searchPhone) return;

    setSearchLoading(true);
    try {
      const cleanPhone = searchPhone.trim();
      const bookingsRef = collection(db, "bookings");
      
      const q1 = query(bookingsRef, where("patientPhone", "==", cleanPhone));
      const q2 = query(bookingsRef, where("phone", "==", cleanPhone));
      
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      
      const activeOne = [];
      
      const processSnap = (snapshot) => {
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.status !== "completed" && data.status !== "cancelled") {
            activeOne.push({ id: docSnap.id, ...data });
          }
        });
      };

      processSnap(snap1);
      if (activeOne.length === 0) processSnap(snap2);

      if (activeOne.length > 0) {
        setMyActiveBooking(activeOne[0]); 
        alert("تم العثور على حجزك بنجاح! 🎯");
      } else {
        alert("عذراً، لم يتم العثور على أي حجز نشط مرتبط بهذا الرقم اليوم. 🤷‍♂️");
      }
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء البحث. يرجى مراجعة الصلاحيات وقواعد البيانات.");
    } finally {
      setSearchLoading(false);
    }
  };

  // 4. معالجة الحجز الجديد الفوري من نفس الصفحة
  const handleBooking = async (e) => {
    e.preventDefault();
    if (!selectedDocId || !patientName || !patientPhone) {
      alert("برجاء اختيار الطبيب وإدخال البيانات كاملة! 📑");
      return;
    }

    setLoading(true);
    const doctorRef = doc(db, "doctors", selectedDocId);

    try {
      let finalBookingId = "";
      let finalBookingData = {};

      // حساب التاريخ المحلي الفوري للعميل لمنع أي مشاكل في العدادات
      const localDateStr = new Date().toLocaleDateString('fr-CA');

      await runTransaction(db, async (transaction) => {
        const doctorDoc = await transaction.get(doctorRef);
        const lastNumber = doctorDoc.data().lastGeneratedNumber || 0;
        const nextNumber = lastNumber + 1;

        transaction.update(doctorRef, { lastGeneratedNumber: nextNumber });

        const bookingRef = doc(collection(db, "bookings"));
        finalBookingId = bookingRef.id;
        finalBookingData = {
          doctorId: selectedDocId,
          doctorName: doctorDoc.data().name,
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim(),
          phone: patientPhone.trim(), 
          queueNumber: nextNumber,
          status: "waiting",
          paymentStatus: "approved", 
          bookingDateStr: localDateStr, // ربط الحقل الموحد لضمان تفعيل العداد تلقائياً
          createdAt: new Date()
        };

        transaction.set(bookingRef, finalBookingData);
      });

      setMyActiveBooking({ id: finalBookingId, ...finalBookingData });
      setPatientName('');
      setPatientPhone('');
      alert("تم الحجز بنجاح! 🎉");
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء الحجز.");
    } finally {
      setLoading(false);
    }
  };

  // 5. إلغاء الحجز
  const handleCancelBooking = async () => {
    if (window.confirm("هل أنت متأكد من إلغاء حجزك الحالي؟")) {
      try {
        if (myActiveBooking?.id) {
          await deleteDoc(doc(db, "bookings", myActiveBooking.id));
        }
        setMyActiveBooking(null);
        setSearchPhone('');
        alert("تم إلغاء الحجز بنجاح. 🧼");
      } catch (error) {
        alert("حدث خطأ أثناء إلغاء الحجز.");
      }
    }
  };

  // جلب بيانات الطبيب الحالي المختار عن طريق الـ ID بشكل مضمون
  const currentDoctorData = doctorsMap[selectedDocId] || null;
  const currentQueueNumber = currentDoctorData?.currentNumber || 0;

  // حسبة كم مريض متبقي أمام المريض
  const getRemainingCount = () => {
    if (!myActiveBooking) return 0;
    const diff = myActiveBooking.queueNumber - currentQueueNumber;
    return diff > 0 ? diff : 0;
  };

  // دالة مساعدة مطورة لترجمة الأيام الإنجليزية ودعم الحروف الكبيرة والصغيرة
  const translateDay = (day) => {
    if (!day) return '';
    const d = day.trim().toLowerCase();
    const daysMap = {
      saturday: 'السبت',
      sunday: 'الأحد',
      monday: 'الإثنين',
      tuesday: 'الثلاثاء',
      wednesday: 'الأربعاء',
      thursday: 'الخميس',
      friday: 'الجمعة'
    };
    return daysMap[d] || day;
  };

  return (
    <div className="w-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden text-right max-w-md mx-auto font-sans" dir="rtl">
      
      {/* 🔍 صندوق الاستعلام السريع برقم الموبايل */}
      {!myActiveBooking && (
        <div className="p-4 bg-amber-50 border-b border-amber-100/60">
          <form onSubmit={handleSearchBooking} className="space-y-2">
            <label className="block text-xs font-bold text-amber-800">🕵️ هل حجزت اليوم وتريد معرفة دورك؟ استعلم هنا:</label>
            <div className="flex gap-2">
              <input 
                type="tel" 
                placeholder="اكتب رقم الموبايل المحجوز به..." 
                className="flex-1 p-2 bg-white border border-amber-200 rounded-xl text-xs text-left outline-none"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                required
              />
              <button 
                type="submit" 
                disabled={searchLoading}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                {searchLoading ? "بحث..." : "استعلام 🔍"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* اختيار الطبيب (يختفي عند ظهور التذكرة) */}
      {!myActiveBooking && (
        <div className="bg-gray-50 p-4 border-b border-gray-100">
          <label className="block text-xs font-bold text-gray-500 mb-1.5">أو اختر طبيب عيادة لحجز دور جديد:</label>
          <select 
            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none"
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
          >
            {doctors.map(docItem => (
              <option key={docItem.id} value={docItem.id}>{docItem.name} ({docItem.specialty})</option>
            ))}
          </select>
        </div>
      )}

      {/* بطاقة العيادة المختارة ومواعيدها مرنة الأحرف */}
      {currentDoctorData && !myActiveBooking && (
        <div className="bg-linear-to-r from-blue-600 to-blue-700 p-5 text-white">
          <div className="text-center">
            <h3 className="text-xl font-bold">{currentDoctorData.name}</h3>
            <p className="text-blue-100 text-xs mt-0.5">{currentDoctorData.specialty}</p>
          </div>
          
          <div className="mt-3 bg-white bg-opacity-10 rounded-xl p-2.5 text-xs space-y-1">
            <p className="font-bold text-blue-200 mb-1 text-[11px]">🕒 جدول مواعيد العيادة للأيام:</p>
            {currentDoctorData.schedule && typeof currentDoctorData.schedule === 'object' && Object.keys(currentDoctorData.schedule).length > 0 ? (
              Object.entries(currentDoctorData.schedule).map(([day, timeObj]) => (
                <div key={day} className="flex justify-between border-b border-white border-opacity-10 pb-1 last:border-0 last:pb-0">
                  <span className="font-bold">{translateDay(day)}:</span>
                  <span className="font-mono">من {timeObj?.from || '--'} إلى {timeObj?.to || '--'}</span>
                </div>
              ))
            ) : (
              <p className="text-amber-200 text-center text-[10px]">لم يتم تحديد جدول مواعيد منفصل للأيام بعد.</p>
            )}
          </div>
        </div>
      )}

      {/* طابور الحالات والتعامل مع التذكرة الفعالة */}
      <div className="p-6 space-y-6">
        
        {/* البوكس الأساسي للدور الحالي في العيادة */}
        {!myActiveBooking && (
          <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
            <span className="text-xs font-bold text-blue-500 uppercase">الدور الحالي داخل العيادة الآن</span>
            <div className="text-4xl font-black text-blue-700 mt-1 font-mono">#{currentQueueNumber}</div>
          </div>
        )}

        {myActiveBooking ? (
          /* شاشة التذكرة المسترجعة الذكية بالكامل بعد تعديل مرونة الأحرف */
          <div className="p-5 bg-white border border-slate-200 rounded-3xl text-center space-y-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] px-3 py-1 rounded-bl-xl font-black">
              تذكرتك النشطة اليوم للمتابعة ⏱️
            </div>
            
            <div className="pt-4 text-right space-y-1.5 border-b border-slate-100 pb-3 text-xs">
              <p className="font-black text-slate-800 text-sm">👤 اسم المريض: <span className="text-blue-600 font-bold">{myActiveBooking.patientName}</span></p>
              <p className="font-bold text-slate-600">
                🩺 عيادة الطبيب: <span className="text-slate-800">{(currentDoctorData && currentDoctorData.name) || myActiveBooking.doctorName}</span>
              </p>
              
              {/* 📅 عرض مواعيد العيادة من حقل schedule المحدث داخل التذكرة للعميل */}
              {currentDoctorData && currentDoctorData.schedule && typeof currentDoctorData.schedule === 'object' && Object.keys(currentDoctorData.schedule).length > 0 && (
                <div className="mt-1 bg-blue-50/50 p-2 rounded-lg border border-blue-100/40 text-[11px] space-y-1">
                  <p className="font-bold text-blue-800 text-[10px] mb-0.5">📅 مواعيد تواجد الطبيب المعتمدة:</p>
                  {Object.entries(currentDoctorData.schedule).map(([day, timeObj]) => (
                    <div key={day} className="flex justify-between text-slate-600">
                      <span>• {translateDay(day)}:</span>
                      <span className="font-mono text-blue-700">من {timeObj?.from || '--'} إلى {timeObj?.to || '--'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* حالة الحجز والتأكيد المالي */}
              <div className="flex items-center gap-1.5 pt-1.5">
                <span className="font-bold text-slate-600">حالة تأكيد الحجز:</span>
                {myActiveBooking.status === 'pending' || myActiveBooking.paymentStatus === 'pending' ? (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md font-black text-[10px]">🔄 قيد مراجعة التحويل</span>
                ) : (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-black text-[10px]">✅ تم التأكيد ومقيد بالجدول</span>
                )}
              </div>
            </div>

            {/* 📊 البوكس الثلاثي الممتاز لعرض البيانات الفورية */}
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              
              <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-xl">
                <p className="text-[10px] text-blue-700 font-black mb-0.5">رقم دورك</p>
                <p className="text-xl font-black text-blue-600 font-mono">#{myActiveBooking.queueNumber || "0"}</p>
              </div>

              <div className="p-2.5 bg-amber-50/60 border border-amber-100 rounded-xl">
                <p className="text-[10px] text-amber-700 font-black mb-0.5">اللي جوه الآن</p>
                <p className="text-xl font-black text-amber-600 font-mono">#{currentQueueNumber}</p>
              </div>

              <div className={`p-2.5 border rounded-xl ${getRemainingCount() === 0 ? 'bg-emerald-50/60 border-emerald-100' : 'bg-rose-50/60 border-rose-100'}`}>
                <p className="text-[10px] text-slate-700 font-black mb-0.5">فاضلك كام واحد</p>
                <p className={`text-sm font-black mt-1 ${getRemainingCount() === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {getRemainingCount() === 0 ? 'دورك جاري! 🔔' : `${getRemainingCount()} حالات`}
                </p>
              </div>

            </div>

            {/* التوجيهات الحركية والتنبيهية التلقائية بناءً على الطابور */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 text-center font-bold">
              {myActiveBooking.queueNumber === currentQueueNumber ? (
                <p className="text-amber-600 font-black animate-pulse">📢 تفضل بالتوجه لغرفة الطبيب الآن، دورك الحالي بالداخل!</p>
              ) : myActiveBooking.queueNumber < currentQueueNumber ? (
                <p className="text-red-500 font-black">⚠️ عذراً، لقد تخطى العداد رقمك. يرجى مراجعة موظف الاستقبال لتنظيم دخولك.</p>
              ) : getRemainingCount() <= 2 ? (
                <p className="text-blue-600 font-black">⏱️ دورك اقترب جداً (حالتين أو أقل أمامك)، يرجى التواجد بصالة الانتظار فوراً.</p>
              ) : (
                <p className="text-emerald-600">☕ لا داعي للاستعجال، يمكنك الاسترخاء متبقي وقت كافٍ حتى يحين دورك.</p>
              )}
            </div>

            {/* أزرار الإجراءات */}
            <div className="flex gap-2 pt-2">
              <button 
                type="button"
                onClick={() => { setMyActiveBooking(null); setSearchPhone(''); }}
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer"
              >
                الخروج من التذكرة ↩️
              </button>
              <button 
                type="button"
                onClick={handleCancelBooking}
                className="flex-1 bg-white hover:bg-red-50 text-red-500 border border-red-200 text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer"
              >
                إلغاء حجزك نهائياً ❌
              </button>
            </div>
          </div>
        ) : (
          /* فورم الحجز الاحتياطي */
          <form onSubmit={handleBooking} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1.5">اسم المريض ثلاثي:</label>
              <input type="text" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="اكتب اسمك هنا..." required />
            </div>

            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1.5">رقم موبايل المريض للتواصل المباشر:</label>
              <input type="tel" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-left text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="01xxxxxxxxx" required />
            </div>

            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl text-xs transition-all cursor-pointer shadow-md">
              {loading ? "جاري الحجز الفوري..." : "احجز دورك الفوري بالعيادة 🚀"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}