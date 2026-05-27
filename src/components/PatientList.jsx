function PatientList({ patients }) {

  return (
    <div className="patients-list">

      <h3>قائمة الانتظار</h3>

      {patients.map((patient) => (

        <div
          className="patient-item"
          key={patient.id}
        >

          <div>
            <strong>{patient.number}</strong>
          </div>

          <div>
            <p>{patient.name}</p>

            <small>{patient.phone}</small>
          </div>

        </div>

      ))}

    </div>
  );
}

export default PatientList;