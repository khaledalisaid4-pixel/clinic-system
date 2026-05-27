import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, writeBatch, setDoc, getDocs, query, where } from 'firebase/firestore';

export default function AdminPanel() {
  const [doctors, setDoctors] = useState([]);
  const [specialties, setSpecialties] = useState([]); 
  const [selectedSpecialty, setSelectedSpecialty] = useState(''); 
  const [filteredDoctors, setFilteredDoctors] = useState([]); 
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [bookings, setBookings] = useState([]);
  
  const [ticketPrice, setTicketPrice] = useState(200);
  const [transferNumber, setTransferNumber] = useState('01012345678');

  const [dbPassword, setDbPassword] = useState(''); 
  const [inputPassword, setInputPassword] = useState(''); 
  const [isAuthorized, setIsAuthorized] = useState(false); 

  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const [activeScreenshot, setActiveScreenshot] = useState(null);

  // حالة التحكم في استقبال الحجوزات للمرضى
  const [isBookingOpen, setIsBookingOpen] = useState(true);

  // حالات التحكم في تفعيل وتعطيل بوابات الدفع
  const [isVodafoneEnabled, setIsVodafoneEnabled] = useState(true);
  const [isInstapayEnabled, setIsInstapayEnabled] = useState(true);
  const [isClinicEnabled, setIsClinicEnabled] = useState(true);

  // 🔥 حالات فلترة تواريخ تصدير الإكسيل (تلقائيًا على تاريخ اليوم)
  const [startDate, setStartDate] = useState(new Date().toLocaleDateString('fr-CA'));
  const [endDate, setEndDate] = useState(new Date().toLocaleDateString('fr-CA'));
  const [isExporting, setIsExporting] = useState(false);

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
      const toTime = timeValue.to || timeValue.end || '';
      if (fromTime && toTime) rawTimeText = `من ${fromTime} إلى ${toTime}`;
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
    const unsubPassword = onSnapshot(doc(db, 'settings', 'admin_auth'), (docSnap) => {
      if (docSnap.exists()) setDbPassword(docSnap.data().password);
      else setDbPassword('123456');
    });

    const unsubSpecs = onSnapshot(doc(db, 'settings', 'clinic_specs'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.ticketPrice) setTicketPrice(Number(data.ticketPrice));
        if (data.transferNumber) setTransferNumber(data.transferNumber);
        if (data.isBookingOpen !== undefined) setIsBookingOpen(data.isBookingOpen);
        
        if (data.isVodafoneEnabled !== undefined) setIsVodafoneEnabled(data.isVodafoneEnabled);
        if (data.isInstapayEnabled !== undefined) setIsInstapayEnabled(data.isInstapayEnabled);
        if (data.isClinicEnabled !== undefined) setIsClinicEnabled(data.isClinicEnabled);
      }
    });

    const unsubDocs = onSnapshot(collection(db, 'doctors'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDoctors(list);

      const uniqueSpecs = [...new Set(list.map(d => d.specialty || 'عيادة عامة'))];
      setSpecialties(uniqueSpecs);
      
      setSpecialties(prev => {
        if (!selectedSpecialty && uniqueSpecs.length > 0) {
          setSelectedSpecialty(uniqueSpecs[0]);
        }
        return uniqueSpecs;
      });
    });

    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubDocs(); unsubBookings(); unsubSpecs(); unsubPassword(); };
  }, [selectedSpecialty]);

  useEffect(() => {
    if (selectedSpecialty) {
      const filtered = doctors.filter(d => (d.specialty || 'عيادة عامة') === selectedSpecialty);
      setFilteredDoctors(filtered);
      
      const isCurrentDocInFiltered = filtered.some(d => d.id === selectedDoctor);
      if (!isCurrentDocInFiltered) {
        if (filtered.length > 0) {
          setSelectedDoctor(filtered[0].id);
        } else {
          setSelectedDoctor('');
        }
      }
    }
  }, [selectedSpecialty, doctors, selectedDoctor]);

  // تصفية القوائم الحية واليومية بناءً على الطبيب النشط واليوم الحالي
  const activeBookings = bookings.filter(b => {
    const todayStr = new Date().toLocaleDateString('fr-CA'); 
    const matchDoctor = b.doctorId === selectedDoctor;
    const matchDate = b.bookingDateStr === todayStr || b.createdAtDateStr === todayStr;
    return matchDoctor && matchDate;
  });

  // طابور الانتظار: يشمل فقط الحالات التي تم تأكيدها ماليًا ولها رقم دور في الطابور
  const waitingList = activeBookings.filter(b => b.status === 'waiting' && b.paymentStatus === 'confirmed' && b.queueNumber).sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0));
  const patientInside = activeBookings.find(b => b.status === 'inside');
  
  // ترتيب المعلق بالأسبقية الزمنية التلقائية بناءً على وقت إنشاء الحجز المريض (الأقدم للأحدث)
  const pendingPaymentsList = activeBookings.filter(b => {
    if (b.status === 'archived' || b.status === 'completed' || b.status === 'inside') return false;
    
    const isPendingElectronic = b.paymentStatus === 'pending' && b.paymentMethod !== 'clinic';
    const isUnconfirmedClinic = b.paymentMethod === 'clinic' && !b.queueNumber;
    
    return isPendingElectronic || isUnconfirmedClinic;
  }).sort((a, b) => {
    const timeA = a.createdAt?.seconds || new Date(a.createdAt).getTime() || 0;
    const timeB = b.createdAt?.seconds || new Date(b.createdAt).getTime() || 0;
    return timeA - timeB;
  });
  
  const completedList = activeBookings.filter(b => b.status === 'completed' || b.status === 'archived').sort((a, b) => (b.queueNumber || 0) - (a.queueNumber || 0));

  const confirmedPaymentsCount = activeBookings.filter(b => b.paymentStatus === 'confirmed' && b.queueNumber).length;
  const totalRevenue = confirmedPaymentsCount * ticketPrice;

  const handleLogin = (e) => {
    e.preventDefault();
    if (inputPassword === dbPassword) setIsAuthorized(true);
    else alert('❌ الباسورد غير صحيح!');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (oldPasswordInput !== dbPassword) {
      alert('❌ كلمة المرور القديمة غير صحيحة!');
      return;
    }
    try {
      await setDoc(doc(db, 'settings', 'admin_auth'), { password: newPasswordInput.trim() }, { merge: true });
      alert('🔒 تم تحديث كلمة المرور بنجاح!');
      setOldPasswordInput(''); setNewPasswordInput('');
    } catch (error) { console.error(error); }
  };

  const handlePriceChange = async (newPrice) => {
    const val = Number(newPrice); setTicketPrice(val);
    try { await setDoc(doc(db, 'settings', 'clinic_specs'), { ticketPrice: val }, { merge: true }); } catch (error) { console.error(error); }
  };

  const handleNumberChange = async (newNumber) => {
    setTransferNumber(newNumber);
    try { await setDoc(doc(db, 'settings', 'clinic_specs'), { transferNumber: newNumber }, { merge: true }); } catch (error) { console.error(error); }
  };

  const handleToggleVodafone = async (checked) => {
    setIsVodafoneEnabled(checked);
    try { await setDoc(doc(db, 'settings', 'clinic_specs'), { isVodafoneEnabled: checked }, { merge: true }); } catch (error) { console.error(error); }
  };

  const handleToggleInstapay = async (checked) => {
    setIsInstapayEnabled(checked);
    try { await setDoc(doc(db, 'settings', 'clinic_specs'), { isInstapayEnabled: checked }, { merge: true }); } catch (error) { console.error(error); }
  };

  const handleToggleClinic = async (checked) => {
    setIsClinicEnabled(checked);
    try { await setDoc(doc(db, 'settings', 'clinic_specs'), { isClinicEnabled: checked }, { merge: true }); } catch (error) { console.error(error); }
  };

  const toggleBookingStatus = async () => {
    const settingsRef = doc(db, 'settings', 'clinic_specs');
    try {
      await updateDoc(settingsRef, { isBookingOpen: !isBookingOpen });
    } catch (error) {
      await setDoc(settingsRef, { isBookingOpen: !isBookingOpen }, { merge: true });
    }
  };

  const handleConfirmPayment = async (id) => {
    try {
      const bookingsWithQueue = activeBookings.filter(b => b.queueNumber);
      const maxQueueNumber = bookingsWithQueue.reduce((max, b) => (b.queueNumber > max ? b.queueNumber : max), 0);
      const nextQueueNumber = maxQueueNumber + 1;

      await updateDoc(doc(db, 'bookings', id), { 
        paymentStatus: 'confirmed',
        status: 'waiting',
        queueNumber: nextQueueNumber
      });
      alert(`💵 تم اعتماد الحالة بنجاح وإدراج المريض برقم (#${nextQueueNumber}) في الطابور!`);
    } catch (error) { console.error(error); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try { await updateDoc(doc(db, 'bookings', id), { status: newStatus }); } catch (error) { console.error(error); }
  };

  const handleNextPatient = async () => {
    if (waitingList.length === 0) {
      alert('لا يوجد مرضى مؤكدين في الانتظار حالياً!');
      return;
    }
    
    const currentDoctorId = selectedDoctor;

    if (patientInside) {
      await updateDoc(doc(db, 'bookings', patientInside.id), { status: 'completed' });
    }
    const nextPatient = waitingList[0];
    await updateDoc(doc(db, 'bookings', nextPatient.id), { status: 'inside' });
    
    try {
      await updateDoc(doc(db, 'doctors', currentDoctorId), { currentNumber: nextPatient.queueNumber });
    } catch (err) { console.error(err); }
  };

  const handleClearDay = async () => {
    if (!window.confirm("هل أنت متأكد من تصفير الطابور لليوم?")) return;
    try {
      const batch = writeBatch(db);
      activeBookings.forEach(b => { 
        if(b.status !== 'archived') {
          batch.update(doc(db, 'bookings', b.id), { status: 'archived' }); 
        }
      });
      await batch.commit();
      await updateDoc(doc(db, 'doctors', selectedDoctor), { currentNumber: 0 });
      alert('تم تصفير المنظومة بنجاح!');
    } catch (error) { console.error(error); }
  };

  // 🔥 ميزة تصدير تقرير الإكسيل الاحترافي المباشر من Firestore
  const exportToExcel = async () => {
    if (!startDate || !endDate) {
      alert('الرجاء اختيار تاريخ البدء وتاريخ النهاية أولاً! 📅');
      return;
    }
    setIsExporting(true);
    try {
      // جلب مباشر وآمن من الـ Firestore بدون الاعتماد على الـ state الحالية لتفادي مشكلة التصفير
      const bookingsRef = collection(db, 'bookings');
      const q = query(
        bookingsRef,
        where('bookingDateStr', '>=', startDate),
        where('bookingDateStr', '<=', endDate)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedBookings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (fetchedBookings.length === 0) {
        alert('لا توجد أي حجوزات مسجلة في هذه الفترة المحددة! 🤷‍♂️');
        setIsExporting(false);
        return;
      }

      // تصفية الحجوزات لتشمل فقط الطبيب النشط حالياً ليكون التقرير دقيقاً ومخصصاً لشفت هذا الدكتور
      const doctorSpecificBookings = fetchedBookings.filter(b => b.doctorId === selectedDoctor);

      if (doctorSpecificBookings.length === 0) {
        alert('لا توجد حجوزات لهذا الدكتور بالذات في الفترة المحددة. 👨‍⚕️');
        setIsExporting(false);
        return;
      }

      // بناء محتوى ملف الـ CSV وتحديد العناوين الرئيسية
      const headers = ['رقم الدور', 'اسم المريض', 'رقم الهاتف', 'طريقة الدفع', 'حالة الدفع', 'حالة الحجز', 'التاريخ', 'وقت الطلب'];
      
      const rows = doctorSpecificBookings.map(b => {
        let payMethodText = b.paymentMethod === 'clinic' ? 'كاش بالعيادة' : 'تحويل إلكتروني';
        let payStatusText = b.paymentStatus === 'confirmed' ? 'مؤكد ومعتمد' : 'معلق/غير مؤكد';
        let statusText = 'مؤرشف/منتهي';
        if (b.status === 'waiting') statusText = 'في الانتظار';
        if (b.status === 'inside') statusText = 'داخل الكشف';
        if (b.status === 'completed') statusText = 'مكتمل';

        return [
          b.queueNumber ? `#${b.queueNumber}` : 'بدون دور',
          b.patientName || 'بدون اسم',
          b.senderPhone || 'لا يوجد',
          payMethodText,
          payStatusText,
          statusText,
          b.bookingDateStr || '',
          b.createdAtTimeStr || ''
        ];
      });

      // دمج العناوين مع الصفوف بفواصل ومراعاة الفاصلة لملفات الـ CSV
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // استخدام الـ BOM (\uFEFF) السحري لإجبار Excel على قراءة الملف بترميز UTF-8 ودعم الحروف العربية بالكامل
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // تسمية الملف باسم الدكتور والفترة لسهولة الفهرسة والأرشفة للمحاسب
      const docName = currentDocData ? currentDocData.name.replace(/\s+/g, '_') : 'doctor';
      link.setAttribute('download', `تقرير_حسابات_${docName}_من_${startDate}_إلى_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Error exporting snapshot data: ', error);
      alert('حدث خطأ أثناء تصدير البيانات، برجاء المحاولة لاحقاً.');
    } finally {
      setIsExporting(false);
    }
  };

  const renderPaymentOption = (booking) => {
    if (booking.paymentMethod === 'clinic') {
      return <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">🏥 دفع بالعيادة</span>;
    }
    return (
      <button onClick={() => setActiveScreenshot(booking.screenshot)} className="bg-slate-900 text-white px-3 py-2 rounded-xl font-black text-[10px] cursor-pointer hover:bg-slate-800 transition-colors">🖼️ معاينة</button>
    );
  };

  const currentDocData = doctors.find(d => d.id === selectedDoctor);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 font-sans" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto">🔒</div>
          <h2 className="text-lg font-black text-slate-800">لوحة تحكم السكرتارية والخزينة</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" placeholder="••••••••" value={inputPassword} onChange={(e) => setInputPassword(e.target.value)} className="w-full p-3.5 rounded-2xl border border-slate-200 text-base font-black text-center tracking-widest bg-slate-50 text-slate-800" required/>
            <button type="submit" className="w-full bg-blue-600 text-white font-black text-xs py-3 rounded-2xl shadow-lg cursor-pointer hover:bg-blue-700 transition-colors">🔓 فتح النظام</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans" dir="rtl">
      
      {/* الهيدر العلوي */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <h1 className="text-sm font-black">💰 نظام الخزينة والمراجعة المزدوجة</h1>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleBookingStatus}
            className={`px-4 py-2 rounded-xl text-[11px] font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer border ${
              isBookingOpen 
                ? 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border-emerald-500/40' 
                : 'bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-500/40'
            }`}
          >
            {isBookingOpen ? '🟢 استقبال الحجوزات مفتوح' : '🔴 استقبال الحجوزات مغلق'}
          </button>

          <button onClick={handleClearDay} className="bg-rose-600 text-white font-extrabold text-[11px] px-4 py-2 rounded-xl cursor-pointer hover:bg-rose-700 transition-colors">🔄 تصفير الطابور</button>
        </div>
      </div>

      <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start flex-1">
        
        {/* العمود الجانبي المليء بالخصائص والأزرار والمبيعات */}
        <div className="space-y-5 lg:col-span-1">
          
          {/* 🔥 كارت تقفيل الشفت وتصدير تقارير الحسابات المضافة حديثاً */}
          <div className="bg-linear-to-br from-amber-50 to-orange-50/60 p-5 rounded-3xl shadow-xs border border-amber-200 space-y-3.5">
            <p className="font-black text-amber-900 text-xs flex items-center gap-1.5">📊 تقفيل الشفت وتصدير الحسابات (Excel):</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <label className="block text-slate-600 font-bold mb-1">من تاريخ:</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 rounded-xl border border-amber-200 bg-white font-bold text-slate-800 outline-none text-center" />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">إلى تاريخ:</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 rounded-xl border border-amber-200 bg-white font-bold text-slate-800 outline-none text-center" />
              </div>
            </div>
            <button 
              onClick={exportToExcel} 
              disabled={isExporting}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-black py-2.5 rounded-xl shadow-md transition-all cursor-pointer text-center flex items-center justify-center gap-2"
            >
              {isExporting ? '⏳ جاري استخراج البيانات...' : '📥 تحميل تقرير الحسابات (Excel)'}
            </button>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200 space-y-4">
            
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-700">اختر العيادة النشطة (التخصص):</label>
              <select value={selectedSpecialty} onChange={(e) => setSelectedSpecialty(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-800">
                {specialties.map(spec => <option key={spec} value={spec}>🏥 عيادة {spec}</option>)}
              </select>

              <label className="block text-xs font-black text-slate-700">اختر الدكتور النشط حالياً:</label>
              <select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-800">
                {filteredDoctors.map(d => <option key={d.id} value={d.id}>د / {d.name}</option>)}
              </select>
            </div>

            {currentDocData && currentDocData.schedule && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] space-y-2">
                <p className="font-black text-slate-700 mb-1">🗓️ مواعيد العيادة الحالية:</p>
                {Object.entries(currentDocData.schedule).map(([rawDayKey, timeValue]) => {
                  const s = parseAndRenderSchedule(rawDayKey, timeValue);
                  return (
                    <div key={rawDayKey} className="flex justify-between items-center bg-white border border-slate-100 p-2 rounded-lg">
                      <span className="font-bold text-slate-800">{s.day}</span>
                      <div className="flex flex-row-reverse items-center gap-1 font-sans text-blue-700 font-bold" dir="ltr">
                        <span>من</span>
                        <span className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">{s.startTime}</span>
                        {s.endTime && (
                          <>
                            <span>إلى</span>
                            <span className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">{s.endTime}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl space-y-3">
              <div>
                <label className="block text-[11px] font-black text-blue-950 mb-1">⚙️ قيمة الكشف الحالية:</label>
                <div className="relative flex items-center">
                  <input type="number" value={ticketPrice} onChange={(e) => handlePriceChange(e.target.value)} className="w-full p-2 pl-12 rounded-xl border border-blue-200 font-black text-xs text-center bg-white text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  <span className="absolute left-3 text-[10px] font-black text-blue-500">ج.م</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-blue-950 mb-1">📞 رقم استقبال التحويلات:</label>
                <input type="text" value={transferNumber} onChange={(e) => handleNumberChange(e.target.value)} className="w-full p-2 rounded-xl border border-blue-200 font-black text-xs text-center font-mono tracking-wide bg-white text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
            </div>

            {/* قسم التحكم في تشغيل وإيقاف خيارات الدفع للمرضى */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-2.5 text-[11px]">
              <p className="font-black text-slate-800 flex items-center gap-1 mb-1">⚙️ تحكم طرق دفع المريض:</p>
              
              <div className="space-y-2">
                <label className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-all">
                  <span className="font-bold text-slate-700">🔴 تفعيل فودافون كاش</span>
                  <input 
                    type="checkbox" 
                    checked={isVodafoneEnabled} 
                    onChange={(e) => handleToggleVodafone(e.target.checked)}
                    className="w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-all">
                  <span className="font-bold text-slate-700">⚡ تفعيل إنستا باي</span>
                  <input 
                    type="checkbox" 
                    checked={isInstapayEnabled} 
                    onChange={(e) => handleToggleInstapay(e.target.checked)}
                    className="w-4 h-4 text-pink-600 border-slate-300 rounded focus:pink-red-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-all">
                  <span className="font-bold text-slate-700">🏥 تفعيل الدفع بالعيادة كاش</span>
                  <input 
                    type="checkbox" 
                    checked={isClinicEnabled} 
                    onChange={(e) => handleToggleClinic(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2.5">
              <p className="block text-[11px] font-black text-slate-800">🔐 تعديل كلمة مرور الدخول للوحة:</p>
              <input type="password" required placeholder="كلمة المرور القديمة..." value={oldPasswordInput} onChange={(e) => setOldPasswordInput(e.target.value)} className="w-full p-2 rounded-xl border border-slate-200 text-xs text-center bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"/>
              <input type="password" required placeholder="كلمة المرور الجديدة..." value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} className="w-full p-2 rounded-xl border border-slate-200 text-xs text-center bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"/>
              <button type="submit" className="w-full bg-slate-900 text-white font-black text-[10px] py-2 rounded-xl cursor-pointer">حفظ كلمة المرور الجديدة 💾</button>
            </form>

            <div className="bg-emerald-950 text-emerald-50 p-4 rounded-2xl text-center">
              <p className="text-[10px] font-bold text-emerald-400">إجمالي إيرادات العيادة المعتمدة اليوم</p>
              <p className="text-2xl font-black">{totalRevenue} ج.م</p>
            </div>

            <button onClick={handleNextPatient} className="w-full bg-emerald-600 text-white font-black text-xs py-3 rounded-2xl shadow-md cursor-pointer hover:bg-emerald-700 transition-colors">🔔 استدعاء المريض التالي بالطابور</button>
          </div>
        </div>

        {/* العمود الرئيسي المليء بالجداول ومطابقة البيانات الحية */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* جدول المراجعة والاعتماد */}
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200">
            <h3 className="text-xs font-black text-amber-700 mb-4">⏳ حالات وإيصالات بانتظار المراجعة والاعتماد المالي (مرتبة بالأسبقية ⏱️)</h3>
            <div className="space-y-2.5">
              {pendingPaymentsList.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6 font-bold">لا توجد حالات بانتظار المراجعة حالياً. ✨</p>
              ) : (
                pendingPaymentsList.map(b => (
                  <div key={b.id} className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-black text-slate-800 text-sm">{b.patientName}</p>
                      <p className="text-[11px] text-slate-700 font-bold mt-1">
                        📞 رقم الموبايل للتواصل: <span className="font-mono text-slate-900 font-black bg-slate-200/60 px-2 py-0.5 rounded text-[12px]">{b.senderPhone || 'لا يوجد رقم'}</span>
                      </p>
                      {b.createdAtTimeStr && (
                        <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                          ⏱️ وقت طلب الحجز: <span className="font-mono text-blue-700 font-black bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">{b.createdAtTimeStr}</span>
                        </p>
                      )}
                      {b.paymentMethod === 'clinic' ? (
                        <p className="text-[11px] text-emerald-700 font-bold mt-1.5 flex items-center gap-1">🏥 طريقة الحجز: <span className="font-black bg-emerald-100/50 text-emerald-800 px-1.5 py-0.5 rounded">دفع في العيادة (كاش)</span></p>
                      ) : (
                        <p className="text-[11px] text-purple-700 font-bold mt-1.5 flex items-center gap-1">📱 محفظة إلكترونية: <span className="font-black bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">تم رفع إيصال تحويل</span></p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {renderPaymentOption(b)}
                      <button onClick={() => handleConfirmPayment(b.id)} className="bg-emerald-600 text-white px-3 py-2 rounded-xl font-black text-[10px] cursor-pointer hover:bg-emerald-700 transition-colors">✅ اعتماد وإدراج بالطابور</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* الحالة الموجودة داخل غرفة الكشف */}
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200 border-r-4 border-r-blue-600">
            <h3 className="text-xs font-black text-blue-700 mb-3">🎯 الحالة الموجودة داخل غرفة الكشف الآن</h3>
            {patientInside ? (
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="font-black text-blue-900 text-base">{patientInside.patientName}</p>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5">رقم الموبايل: {patientInside.senderPhone || 'بدون رقم'}</p>
                  {patientInside.paymentMethod !== 'clinic' && (
                    <button onClick={() => setActiveScreenshot(patientInside.screenshot)} className="mt-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg font-black text-[10px] cursor-pointer">🖼️ معاينة الإيصال</button>
                  )}
                </div>
                <div className="text-center bg-blue-600 text-white px-4 py-2 rounded-xl min-w-17.5">
                  <p className="text-[9px] font-bold opacity-80">رقم الدور</p>
                  <p className="text-xl font-black">#{patientInside.queueNumber}</p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 text-center py-4 font-bold">غرفة الكشف فارغة حالياً. اضغط على "استدعاء التالي" بالجانب لإدخال مريض. 💤</p>
            )}
          </div>

          {/* جدول طابور الانتظار الكامل */}
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200">
            <h3 className="text-xs font-black text-slate-800 mb-4">👥 طابور الانتظار الفعلي اليوم ({waitingList.length} مرضى)</h3>
            <div className="overflow-x-auto">
              {waitingList.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-8 font-bold">لا يوجد مرضى في طابور الانتظار حالياً.</p>
              ) : (
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-black">
                      <th className="pb-2">رقم الدور</th>
                      <th className="pb-2">اسم المريض</th>
                      <th className="pb-2">رقم الهاتف</th>
                      <th className="pb-2 text-center">نوع الدفع / المستند</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {waitingList.map((b) => (
                      <tr key={b.id} className="text-slate-700 hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 font-mono font-black text-blue-600 text-sm">#{b.queueNumber}</td>
                        <td className="py-3 font-bold text-slate-900">{b.patientName}</td>
                        <td className="py-3 font-mono">{b.senderPhone || '-'}</td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {renderPaymentOption(b)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* سجل الحالات التي تم الانتهاء منها اليوم */}
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200 border-r-4 border-r-emerald-600">
            <h3 className="text-xs font-black text-emerald-700 mb-4">✅ الحالات التي تم الانتهاء من كشفها اليوم ({completedList.length} حالات)</h3>
            <div className="overflow-x-auto">
              {completedList.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6 font-bold">لم يتم الانتهاء من أي حالة حتى الآن اليوم. 📑</p>
              ) : (
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-black">
                      <th className="pb-2">رقم الدور</th>
                      <th className="pb-2">اسم المريض</th>
                      <th className="pb-2">رقم الهاتف</th>
                      <th className="pb-2 text-center">خيارات الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedList.map((b) => (
                      <tr key={b.id} className="text-slate-600 bg-emerald-50/30 hover:bg-emerald-50/60 transition-colors">
                        <td className="py-3 font-mono font-bold text-emerald-700 line-through text-sm">#{b.queueNumber}</td>
                        <td className="py-3 font-bold text-slate-800 line-through">{b.patientName}</td>
                        <td className="py-3 font-mono opacity-70">{b.senderPhone || '-'}</td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {b.paymentMethod !== 'clinic' && (
                              <button onClick={() => setActiveScreenshot(b.screenshot)} className="bg-slate-200 text-slate-800 px-2 py-1 rounded-md text-[10px] font-black hover:bg-slate-300 cursor-pointer">🖼️ معاينة</button>
                            )}
                            <button onClick={() => handleStatusChange(b.id, 'waiting')} className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-[10px] font-black hover:bg-amber-600 hover:text-white transition-all cursor-pointer">
                              🔄 إرجاع لطابور الانتظار
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* موديول المعاينة المنبثق للإيصالات */}
      {activeScreenshot && (
        <div className="fixed inset-0 bg-black/80 flex flex-col justify-center items-center p-4 z-50">
          <div className="w-full max-w-sm bg-white rounded-3xl p-4 shadow-2xl relative text-center space-y-3">
            <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-96 bg-slate-50 flex items-center justify-center">
              <img src={activeScreenshot} alt="Receipt" className="max-w-full max-h-96 object-contain"/>
            </div>
            <button onClick={() => setActiveScreenshot(null)} className="w-full bg-slate-900 text-white text-xs font-black py-2.5 rounded-xl cursor-pointer">إغلاق المعاينة ❌</button>
          </div>
        </div>
      )}
    </div>
  );
}