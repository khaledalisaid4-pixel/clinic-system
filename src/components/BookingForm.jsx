import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

export default function BookingForm() {
  const [doctors, setDoctors] = useState([]);
  const [specialties, setSpecialties] = useState([]); 
  const [selectedSpecialty, setSelectedSpecialty] = useState(''); 
  const [filteredDoctors, setFilteredDoctors] = useState([]); 
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [docInfo, setDocInfo] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('vodafone');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  
  const [searchResults, setSearchResults] = useState([]); 
  const [hasSearched, setHasSearched] = useState(false);
  
  const [ticketPrice, setTicketPrice] = useState(200);
  const [transferNumber, setTransferNumber] = useState('01012345678');
  
  const [isBookingOpen, setIsBookingOpen] = useState(true);
  const [isCurrentDocOpen, setIsCurrentDocOpen] = useState(true);

  // حالات التحكم الحية المربوطة بلوحة القيادة والأدمن
  const [isVodafoneEnabled, setIsVodafoneEnabled] = useState(true);
  const [isInstapayEnabled, setIsInstapayEnabled] = useState(true);
  const [isClinicEnabled, setIsClinicEnabled] = useState(true);

  // دالة ذكية لضغط الصورة وتحويلها لـ Base64 بحجم صغير جداً لحل مشكلة فشل الرفع
  const compressAndConvertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 600; // تصغير العرض ليكون مناسباً للموبايل والمطابقة
          const scaleSize = MAX_WIDTH / img.width;
          
          if (img.width > MAX_WIDTH) {
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
          } else {
            canvas.width = img.width;
            canvas.height = img.height;
          }

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // ضغط الجودة بنسبة 60% لتقليل المساحة تماماً لنص خفيف جداً
          const base64 = canvas.toDataURL('image/jpeg', 0.6);
          resolve(base64);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const parseAndRenderSchedule = (rawDayKey, timeValue) => {
    let dayName = rawDayKey;
    let rawTimeText = '';
    if (rawDayKey.includes(':')) {
      const parts = rawDayKey.split(':');
      dayName = parts[0].trim();
      rawTimeText = parts.slice(1).join(':').trim();
    }
    if (!rawTimeText && timeValue && typeof timeValue === 'object') {
      const fromTime = timeValue.from || timeValue.start || '';
      const textToTime = timeValue.to || timeValue.end || '';
      if (fromTime && textToTime) rawTimeText = `من ${fromTime} إلى ${textToTime}`;
      else if (fromTime) rawTimeText = `من ${fromTime}`;
    }
    if (!rawTimeText && timeValue && typeof timeValue !== 'object') rawTimeText = String(timeValue);
    
    const d = dayName.toLowerCase();
    if (d.includes('sat') || d.includes('سبت')) dayName = 'السبت';
    else if (d.includes('sun') || d.includes('أحد') || d.includes('احد')) dayName = 'الأحد';
    else if (d.includes('mon') || d.includes('إثنين') || d.includes('اثنين')) dayName = 'الإثنين';
    else if (d.includes('tue') || d.includes('ثلاث')) dayName = 'الثلاثاء';
    else if (d.includes('wed') || d.includes('أربع') || d.includes('اربع')) dayName = 'الأربعاء';
    else if (d.includes('thu') || d.includes('خميس')) dayName = 'الخميس';
    else if (d.includes('fri') || d.includes('جمع')) dayName = 'الجمعة';

    if (rawTimeText) rawTimeText = rawTimeText.replace(/p\.m\./gi, 'PM').replace(/a\.m\./gi, 'AM');

    let startTime = '';
    let endTime = '';
    if (rawTimeText) {
      const timeMatches = rawTimeText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi);
      if (timeMatches && timeMatches.length >= 2) {
        startTime = timeMatches[0].toUpperCase();
        endTime = timeMatches[1].toUpperCase();
      } else if (timeMatches && timeMatches.length === 1) {
        startTime = timeMatches[0].toUpperCase();
      } else {
        startTime = rawTimeText.replace(/من|إلى/g, '').trim();
      }
    }
    return { day: dayName, startTime: startTime || 'متاح', endTime: endTime || '' };
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'doctors'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDoctors(list);
      const uniqueSpecs = [...new Set(list.map(d => d.specialty || 'عيادة عامة'))];
      setSpecialties(uniqueSpecs);
      if (uniqueSpecs.length > 0 && !selectedSpecialty) setSelectedSpecialty(uniqueSpecs[0]);
    });

    const unsubSpecs = onSnapshot(doc(db, 'settings', 'clinic_specs'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.ticketPrice) setTicketPrice(Number(data.ticketPrice));
        if (data.transferNumber) setTransferNumber(data.transferNumber);
        if (data.isBookingOpen !== undefined) setIsBookingOpen(data.isBookingOpen);
        
        // استقطاب إعدادات تشغيل بوابات الدفع حياً من الأدمن
        if (data.isVodafoneEnabled !== undefined) setIsVodafoneEnabled(data.isVodafoneEnabled);
        if (data.isInstapayEnabled !== undefined) setIsInstapayEnabled(data.isInstapayEnabled);
        if (data.isClinicEnabled !== undefined) setIsClinicEnabled(data.isClinicEnabled);
      }
    });

    return () => { unsub(); unsubSpecs(); };
  }, []);

  // تحويل طريقة الدفع تلقائياً إلى خيار متاح في حال قام المسؤول بتعطيل الخيار الافتراضي الحالي
  useEffect(() => {
    if (paymentMethod === 'vodafone' && !isVodafoneEnabled) {
      if (isInstapayEnabled) setPaymentMethod('instapay');
      else if (isClinicEnabled) setPaymentMethod('clinic');
    } else if (paymentMethod === 'instapay' && !isInstapayEnabled) {
      if (isVodafoneEnabled) setPaymentMethod('vodafone');
      else if (isClinicEnabled) setPaymentMethod('clinic');
    } else if (paymentMethod === 'clinic' && !isClinicEnabled) {
      if (isVodafoneEnabled) setPaymentMethod('vodafone');
      else if (isInstapayEnabled) setPaymentMethod('instapay');
    }
  }, [isVodafoneEnabled, isInstapayEnabled, isClinicEnabled, paymentMethod]);

  useEffect(() => {
    if (selectedSpecialty) {
      const currentDayAr = new Date().toLocaleDateString('ar-EG', { weekday: 'long' }); 
      const currentDayEn = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      const filtered = doctors.filter(d => {
        const matchSpec = (d.specialty || 'عيادة عامة') === selectedSpecialty;
        if (!matchSpec) return false;
        if (!d.schedule) return true;
        
        const allowedDaysKeys = Object.keys(d.schedule).map(k => k.toLowerCase());
        return allowedDaysKeys.some(key => {
          if ((currentDayAr.includes('سبت') || currentDayEn.includes('sat')) && (key.includes('sat') || key.includes('سبت'))) return true;
          if ((currentDayAr.includes('أحد') || currentDayAr.includes('احد') || currentDayEn.includes('sun')) && (key.includes('sun') || key.includes('أحد') || key.includes('احد'))) return true;
          if ((currentDayAr.includes('اثنين') || currentDayEn.includes('mon')) && (key.includes('mon') || key.includes('إثنين') || key.includes('اثنين'))) return true;
          if ((currentDayAr.includes('ثلاثاء') || currentDayEn.includes('tue')) && (key.includes('tue') || key.includes('ثلاث'))) return true;
          if ((currentDayAr.includes('أربعاء') || currentDayEn.includes('wed')) && (key.includes('wed') || key.includes('أربع') || key.includes('اربع') || key.includes('wednesday'))) return true;
          if ((currentDayAr.includes('خميس') || currentDayEn.includes('thu')) && (key.includes('thu') || key.includes('خميس'))) return true;
          if ((currentDayAr.includes('جمعة') || currentDayEn.includes('fri')) && (key.includes('fri') || key.includes('جمع'))) return true;
          return false;
        });
      });

      setFilteredDoctors(filtered);
      if (filtered.length > 0) {
        setSelectedDoctor(filtered[0].id);
      } else {
        setSelectedDoctor('');
      }
    }
  }, [selectedSpecialty, doctors]);

  useEffect(() => {
    if (!selectedDoctor) { 
      setDocInfo(null); 
      setIsCurrentDocOpen(true); 
      return; 
    }
    const unsub = onSnapshot(doc(db, 'doctors', selectedDoctor), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDocInfo(data);
        setIsCurrentDocOpen(data.isBookingOpen !== false);
      }
    });
    return () => unsub();
  }, [selectedDoctor]);

  useEffect(() => {
    if (!searchPhone.trim()) { setSearchResults([]); setHasSearched(false); return; }
    const todayStr = new Date().toLocaleDateString('fr-CA');
    
    const unsubBookings = onSnapshot(collection(db, 'bookings'), async (snapshot) => {
      const allBookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const myActiveBookings = allBookings.filter(b => 
        b.senderPhone === searchPhone.trim() && 
        (b.bookingDateStr === todayStr || b.createdAtDateStr === todayStr) && 
        b.status !== 'archived'
      );

      if (myActiveBookings.length > 0) {
        const populatedBookings = await Promise.all(
          myActiveBookings.map(async (booking) => {
            if (booking.doctorId) {
              const dSnap = await getDoc(doc(db, 'doctors', booking.doctorId));
              const dData = dSnap.exists() ? dSnap.data() : {};
              return {
                ...booking,
                doctorName: dData.name || 'غير معروف',
                currentNumber: dData.currentNumber || 0
              };
            }
            return booking;
          })
        );
        setSearchResults(populatedBookings);
        setHasSearched(true);
      } else {
        setSearchResults([]);
        setHasSearched(true);
      }
    });
    
    return () => unsubBookings();
  }, [searchPhone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isBookingOpen) { alert('❌ نعتذر منك، استقبال الحجوزات مغلق حالياً من قبل إدارة العيادة.'); return; }
    if (!isCurrentDocOpen) { alert('❌ نعتذر منك، استقبال الحجوزات لهذا الطبيب مغلق حالياً بطلب من السكرتارية.'); return; }
    if (!selectedDoctor) { alert('❌ من فضلك اختر الدكتور المطلوب أولاً!'); return; }
    if (paymentMethod !== 'clinic' && !file) { alert('❌ من فضلك قم برفع صورة إيصال التحويل أولاً!'); return; }
    
    setLoading(true);
    try {
      // استخدام الدالة المخصصة لضغط مساحة الصورة
      const base64Image = paymentMethod === 'clinic' ? 'الدفع في العيادة' : await compressAndConvertToBase64(file);
      const today = new Date();
      const todayStr = today.toLocaleDateString('fr-CA'); 

      await addDoc(collection(db, 'bookings'), {
        patientName: patientName.trim(),
        senderPhone: senderPhone.trim(),
        paymentMethod,
        screenshot: base64Image, 
        doctorId: selectedDoctor,
        paymentStatus: paymentMethod === 'clinic' ? 'confirmed' : 'pending',
        status: 'waiting',
        queueNumber: 0,
        bookingDateStr: todayStr,
        createdAtDateStr: todayStr,
        createdAt: serverTimestamp()
      });
      alert(paymentMethod === 'clinic' ? '🚀 تم تسجيل حجزك (الدفع في العيادة) بنجاح!' : '🚀 تم إرسال طلب الحجز بنجاح!');
      setPatientName(''); setSenderPhone(''); setFile(null);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء رفع البيانات، حاول مرة أخرى.');
    } finally { 
      setLoading(false); 
    }
  };

  const handleClearSearch = () => {
    setSearchPhone('');
    setSearchResults([]);
    setHasSearched(false);
  };

  const isInputsDisabled = !isBookingOpen || !isCurrentDocOpen || filteredDoctors.length === 0;
  const isAllPaymentsDisabled = !isVodafoneEnabled && !isInstapayEnabled && !isClinicEnabled;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 font-sans flex flex-col items-center gap-6" dir="rtl">
      
      <div className="w-full max-w-xl bg-slate-900 text-white rounded-3xl shadow-xl p-5 md:p-6 space-y-4">
        <div className="flex justify-between items-center gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔍</span>
            <div>
              <h3 className="text-sm font-black">استعلام فوري وبثبات تام عن دورك الفعلي الآن</h3>
              <p className="text-[10px] text-slate-400 font-bold">اكتب رقم الهاتف الذي حجزت به لمتابعة الحجوزات ومكانها في الطابور</p>
            </div>
          </div>
          {(searchPhone || hasSearched) && (
            <button 
              type="button"
              onClick={handleClearSearch}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer border border-slate-700/60 shrink-0"
            >
              ⬅️ عودة للحجز
            </button>
          )}
        </div>

        <input type="tel" placeholder="اكتب رقم الهاتف المسجل به هنا..." value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} className="w-full p-3 rounded-xl bg-slate-800 text-white placeholder-slate-500 border border-slate-700 outline-none text-xs font-bold text-center tracking-wider focus:border-blue-500"/>
        
        {hasSearched && (
          <div className="space-y-4 pt-2">
            {searchResults.length > 0 ? (
              searchResults.map((result, idx) => (
                <div key={result.id} className="bg-slate-800 border border-slate-700 p-5 rounded-2xl space-y-3.5 text-xs relative shadow-inner">
                  <div className="absolute top-3.5 left-4 bg-blue-600 text-[10px] font-black px-2.5 py-0.5 rounded-full text-white">حجز #{idx + 1}</div>
                  <div className="flex justify-between items-center border-b border-slate-700/60 pb-2.5 pt-2">
                    <span className="text-slate-400 font-bold">اسم المريض:</span>
                    <span className="font-black text-blue-400 text-sm">{result.patientName}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-700/60 pb-2.5">
                    <span className="text-slate-400 font-bold">العيادة / الدكتور:</span>
                    <span className="font-black text-white">د / {result.doctorName}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-700/60 pb-2.5">
                    <span className="text-slate-400 font-bold">حالة المراجعة المالية:</span>
                    {result.paymentMethod === 'clinic' ? (
                      <span className="bg-emerald-500/20 text-emerald-400 font-black px-2.5 py-0.5 rounded-md text-[10px]">🏥 الدفع في العيادة</span>
                    ) : result.paymentStatus === 'pending' ? (
                      <span className="bg-amber-500/20 text-amber-400 font-black px-2.5 py-0.5 rounded-md text-[10px] animate-pulse">⏳ في انتظار تأكيد السكرتيرة</span>
                    ) : (
                      <span className="bg-emerald-500/20 text-emerald-400 font-black px-2.5 py-0.5 rounded-md text-[10px]">✅ تم الاعتماد المالي</span>
                    )}
                  </div>
                  {result.paymentStatus === 'confirmed' && (
                    <div className="grid grid-cols-2 gap-3 pt-1 text-center">
                      <div className="bg-blue-600/20 border border-blue-500/30 p-3 rounded-xl">
                        <p className="text-[10px] text-blue-400 font-bold">رقم دورك الثابت</p>
                        <p className="text-2xl font-black text-blue-400 mt-0.5">#{result.queueNumber}</p>
                      </div>
                      <div className="bg-emerald-600/20 border border-emerald-500/30 p-3 rounded-xl">
                        <p className="text-[10px] text-emerald-400 font-bold">رقم الحالة بالداخل الآن</p>
                        <p className="text-2xl font-black text-emerald-400 mt-0.5">#{result.currentNumber}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-rose-400 font-bold py-3 bg-slate-800 border border-slate-700 rounded-2xl text-xs">❌ لا يوجد أي حجز نشط مسجل بهذا الرقم لليوم.</p>
            )}
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleClearSearch}
                className="w-full bg-slate-800 hover:bg-slate-750 text-blue-400 hover:text-blue-300 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border border-slate-700/50"
              >
                🔄 تنظيف البحث والعودة لتقديم حجز جديد
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {!isBookingOpen ? (
          <div className="bg-rose-600 text-white p-4 text-center text-xs font-black animate-pulse flex items-center justify-center gap-1.5">
            <span>🛑 نعتذر منكم: الحجوزات الإلكترونية مغلقة مؤقتاً الآن بطلب من السكرتارية.</span>
          </div>
        ) : !isCurrentDocOpen ? (
          <div className="bg-amber-600 text-white p-4 text-center text-xs font-black animate-pulse flex items-center justify-center gap-1.5">
            <span>⚠️ نعتذر منكم: الحجز الإلكتروني عند هذا الطبيب مغلق مؤقتاً حالياً.</span>
          </div>
        ) : (
          <div className="bg-blue-600 text-white p-5 text-center space-y-1">
            <h2 className="text-base font-black">منظومة الحجز والتأكيد المزدوج الفوري</h2>
            <p className="text-[11px] text-blue-100 font-bold">اختر عيادتك واحجز دورك دون الحاجة للانتظار الطويل في مقر العيادات</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 md:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">1. اختر التخصص الطبي (العيادة):</label>
              <select value={selectedSpecialty} onChange={(e) => setSelectedSpecialty(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none cursor-pointer">
                {specialties.map(spec => <option key={spec} value={spec}>🏥 عيادة {spec}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">2. اختر الطبيب المعالج اليوم:</label>
              <select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none cursor-pointer">
                {filteredDoctors.length === 0 ? (
                  <option value="">⚠️ لا يوجد أطباء متاحين للعمل اليوم في هذا التخصص</option>
                ) : (
                  filteredDoctors.map(d => <option key={d.id} value={d.id}>دكتور / {d.name}</option>)
                )}
              </select>
            </div>
          </div>

          {docInfo && docInfo.schedule && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-2 text-xs">
              <p className="font-black text-blue-900 flex items-center gap-1 mb-2">🗓️ مواعيد العيادة الرسمية المعتمدة للدكتور:</p>
              <div className="space-y-2">
                {Object.entries(docInfo.schedule).map(([rawDayKey, timeValue]) => { 
                  const s = parseAndRenderSchedule(rawDayKey, timeValue); 
                  return (
                    <div key={rawDayKey} className="flex justify-between items-center bg-white border border-blue-100 px-3 py-2 rounded-xl shadow-xs">
                      <span className="font-black text-slate-800 text-[13px]">📍 {s.day}</span>
                      <div className="flex flex-row-reverse items-center gap-1 font-sans text-blue-700 font-extrabold text-[12px] tracking-wide" dir="ltr">
                        <span>من</span>
                        <span className="bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded-md border border-blue-100">{s.startTime}</span>
                        {s.endTime && <><span>إلى</span><span className="bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded-md border border-blue-100">{s.endTime}</span></>}
                      </div>
                    </div>
                  ); 
                })}
              </div>
            </div>
          )}
          
          <div className={`space-y-5 transition-opacity ${(isInputsDisabled || isAllPaymentsDisabled) ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">3. اسم المريض بالكامل:</label>
              <input type="text" required disabled={isInputsDisabled || isAllPaymentsDisabled} placeholder="اكتب الاسم ثلاثي لتسهيل المطابقة" value={patientName} onChange={(e) => setPatientName(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-800 font-bold outline-none"/>
            </div>
            
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">4. رقم الموبايل (المستخدم للحجز والاستعلام):</label>
              <input type="tel" required disabled={isInputsDisabled || isAllPaymentsDisabled} placeholder="اكتب رقم موبايل صحيح ومتاح" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs font-mono text-center text-slate-800 font-black tracking-widest outline-none"/>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-700">5. طريقة الدفع المعتمدة للكشف:</label>
              {isAllPaymentsDisabled ? (
                <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-black text-center">
                  ⚠️ عذراً، جميع خيارات وطرق الدفع معطلة حالياً من قبل الإدارة.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {isVodafoneEnabled && (
                    <label className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1 cursor-pointer transition-all ${paymentMethod === 'vodafone' && filteredDoctors.length > 0 ? 'border-red-500 bg-red-50 text-red-700 font-black' : 'border-slate-100 text-slate-600 font-bold'} ${isInputsDisabled ? 'cursor-not-allowed' : ''}`}>
                      <input type="radio" name="pay" value="vodafone" checked={paymentMethod === 'vodafone'} onChange={() => setPaymentMethod('vodafone')} className="hidden" disabled={isInputsDisabled}/>🔴 فودافون
                    </label>
                  )}
                  {isInstapayEnabled && (
                    <label className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1 cursor-pointer transition-all ${paymentMethod === 'instapay' && filteredDoctors.length > 0 ? 'border-pink-500 bg-pink-50 text-pink-700 font-black' : 'border-slate-100 text-slate-600 font-bold'} ${isInputsDisabled ? 'cursor-not-allowed' : ''}`}>
                      <input type="radio" name="pay" value="instapay" checked={paymentMethod === 'instapay'} onChange={() => setPaymentMethod('instapay')} className="hidden" disabled={isInputsDisabled}/>⚡ إنستا باي
                    </label>
                  )}
                  {isClinicEnabled && (
                    <label className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1 cursor-pointer transition-all ${paymentMethod === 'clinic' && filteredDoctors.length > 0 ? 'border-blue-500 bg-blue-50 text-blue-700 font-black' : 'border-slate-100 text-slate-600 font-bold'} ${isInputsDisabled ? 'cursor-not-allowed' : ''}`}>
                      <input type="radio" name="pay" value="clinic" checked={paymentMethod === 'clinic'} onChange={() => setPaymentMethod('clinic')} className="hidden" disabled={isInputsDisabled}/>🏥 بالعيادة
                    </label>
                  )}
                </div>
              )}

              {filteredDoctors.length > 0 && paymentMethod !== 'clinic' && !isAllPaymentsDisabled && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-[11px] text-slate-600 font-bold text-center">
                  قيمة الكشف: <span className="text-slate-900 font-black text-xs">{ticketPrice} ج.م</span> تُحول للرقم: <span className="font-mono text-blue-600 text-xs font-black select-all tracking-wider">{transferNumber}</span>
                </div>
              )}
              {filteredDoctors.length > 0 && paymentMethod === 'clinic' && !isAllPaymentsDisabled && (
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl text-[11px] text-blue-800 font-bold text-center">
                  💡 سيتم حجز دورك مباشرة بقيمة <span className="font-black text-xs text-slate-900">{ticketPrice} ج.م</span> وتدفع كاش فور وصولك لمقر العيادة.
                </div>
              )}
            </div>
            
            {paymentMethod !== 'clinic' && !isAllPaymentsDisabled && (
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-700">6. ارفع سكرين شوت (إيصال التحويل الناجح):</label>
                <div className={`border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center relative transition-colors ${!isInputsDisabled ? 'hover:border-blue-400 bg-slate-50/50' : 'bg-slate-100'}`}>
                  <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50" disabled={isInputsDisabled}/>
                  <div className="space-y-1">
                    <p className="text-2xl">📸</p>
                    <p className="text-xs font-black text-slate-700">{file ? `✅ تم اختيار: ${file.name}` : 'اضغط هنا لرفع صورة الإيصال المالي المعتمد'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <button type="submit" disabled={loading || isInputsDisabled || isAllPaymentsDisabled} className={`w-full text-white font-black text-xs py-3.5 rounded-xl shadow-lg transition-colors ${loading || isInputsDisabled || isAllPaymentsDisabled ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}>
            {!isBookingOpen 
              ? '🛑 الحجز مغلق حالياً من قِبل السكرتارية' 
              : !isCurrentDocOpen 
              ? '⚠️ نعتذر: هذا الدكتور لا يستقبل حجوزات الآن' 
              : filteredDoctors.length === 0 
              ? '⚠️ لا يمكن الحجز لعدم توافر أطباء اليوم'
              : isAllPaymentsDisabled
              ? '⚠️ جميع بوابات الدفع معطلة حالياً'
              : loading 
              ? '⏳ جاري الحجز...' 
              : '🚀 إرسال الحجز وتأكيد تسجيل البيانات فوراً'}
          </button>
        </form>
      </div>
    </div>
  );
}