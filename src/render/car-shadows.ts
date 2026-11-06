import * as T from 'three';

/** Blended glass is not an opaque shadow caster. Coarse world shadows on
 * centimetre-size cabin details otherwise form moving self-shadow bands. */
export function configureCarShadows(mesh:T.Mesh){
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const opaque=materials.some(m=>!m.transparent&&m.opacity>=.95);
  const cabin=/^COBALT_(Detail_|CabinMirror|Column_|Seat|RearSeat|Headrest|MouldedDashboard|DashboardTray|InstrumentHood|CentreStack|Defrost|Shift|INNER_|DoorCard|STEERING|TACH|DIGITAL|[-\d]+_Seat)/i.test(mesh.name)||materials.some(material=>/^COBALT_(RearWheelWellLining|ParcelShelf|RearPillarTrim)$/.test(material.name));
  for(const material of materials)if(!material.transparent)material.shadowSide=T.BackSide;
  mesh.castShadow=opaque;
  mesh.receiveShadow=opaque&&!cabin;
}
