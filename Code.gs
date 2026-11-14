/**
 * เว็บเช็คชื่อพนักงาน — ส่วนหลังบ้าน (Google Apps Script)
 *
 * วิธีใช้: เปิด Google Sheet > Extensions > Apps Script > วางโค้ดนี้ทั้งหมด
 * แล้ว Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 * ดูขั้นตอนเต็มในไฟล์ README.md
 *
 * ชีตที่ใช้ (สร้างให้อัตโนมัติถ้ายังไม่มี):
 *   Employees   : code, name, dept
 *   Attendance  : docId, date, empId, code, name, dept, checkIn, checkOut, confirmed, confirmedBy, confirmedAt, signature
 *   Settings    : key, value  (เก็บแฮชของ PIN หัวหน้างาน)
 */

const TZ = 'Asia/Bangkok';
const VERSION = '1.2.2';
const EMP = { name: 'Employees', head: ['code', 'name', 'dept'] };
const ATT = {
  name: 'Attendance',
  head: ['docId', 'date', 'empId', 'code', 'name', 'dept', 'checkIn', 'checkOut', 'confirmed', 'confirmedBy', 'confirmedAt', 'signature']
};
const SET = { name: 'Settings', head: ['key', 'value'] };
const SIG_MAX = 49000; // เซลล์ของ Google Sheets รับได้ไม่เกิน 50,000 ตัวอักษร

/* ---------- จุดรับคำขอ ---------- */

function doGet() {
  return out({ ok: true, version: VERSION, message: 'เว็บเช็คชื่อพนักงาน API ทำงานปกติ' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return out({ ok: true, data: handle(body) });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- ตัวจัดการคำสั่ง ---------- */

function handle(body) {
  switch (body.action) {
    case 'getAll':
      return {
        employees: readEmployees(),
        attendance: readAttendance(),
        pinSet: !!getSetting('pinHash'),
        version: VERSION
      };

    case 'setupPin': {
      if (getSetting('pinHash')) throw new Error('มี PIN หัวหน้างานแล้ว');
      if (!/^[a-f0-9]{64}$/.test(body.pinHash || '')) throw new Error('รูปแบบ PIN ไม่ถูกต้อง');
      setSetting('pinHash', body.pinHash);
      return { ok: true };
    }

    case 'verifyPin':
      requireSupervisor(body.pinHash);
      return { ok: true };

    case 'checkIn': {
      const empId = safeId(body.empId);
      const date = checkDate(body.date);
      const emp = findEmp(empId);
      if (!emp) throw new Error('ไม่พบพนักงาน');
      const docId = date + '_' + empId;
      const sh = getSheet(ATT);
      const row = findAtt(docId);
      if (row && row.checkIn) throw new Error('วันนี้เข้างานแล้ว');
      const now = new Date().toISOString();
      const values = [docId, date, empId, String(emp.code), String(emp.name), String(emp.dept || ''), now, '', false, '', '', ''];
      if (row) sh.getRange(row._row, 1, 1, ATT.head.length).setValues([values]);
      else sh.appendRow(values);
      return { docId: docId };
    }

    case 'checkOut': {
      const row = findAtt(String(body.docId || ''));
      if (!row || !row.checkIn) throw new Error('ยังไม่ได้เข้างานวันนี้');
      if (row.checkOut) throw new Error('ออกงานแล้ว');
      getSheet(ATT).getRange(row._row, colOf(ATT, 'checkOut')).setValue(new Date().toISOString());
      return { ok: true };
    }

    case 'confirm': {
      requireSupervisor(body.pinHash);
      const row = findAtt(String(body.docId || ''));
      if (!row || !row.checkIn) throw new Error('ไม่พบรายการเข้างาน');
      if (row.confirmed) throw new Error('รายการนี้ยืนยันแล้ว');
      const signature = String(body.signature || '');
      if (signature.length > SIG_MAX) throw new Error('ลายเซ็นมีขนาดใหญ่เกินไป');
      getSheet(ATT).getRange(row._row, colOf(ATT, 'confirmed'), 1, 4)
        .setValues([[true, 'หัวหน้างาน', new Date().toISOString(), signature]]);
      return { ok: true };
    }

    case 'confirmAll': {
      requireSupervisor(body.pinHash);
      const date = checkDate(body.date);
      const sh = getSheet(ATT);
      const rows = readAttendance().filter(r => r.date === date && r.checkIn && !r.confirmed);
      const now = new Date().toISOString();
      rows.forEach(r => sh.getRange(r._row, colOf(ATT, 'confirmed'), 1, 3).setValues([[true, 'หัวหน้างาน', now]]));
      return { count: rows.length };
    }

    case 'addEmployee': {
      requireSupervisor(body.pinHash);
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      if (!safeId(code) || !name) throw new Error('กรุณากรอกรหัสและชื่อ');
      if (findEmp(safeId(code))) throw new Error('รหัสนี้มีอยู่แล้ว');
      getSheet(EMP).appendRow([code, name, String(body.dept || '').trim()]);
      return { ok: true };
    }

    case 'importEmployees': {
      requireSupervisor(body.pinHash);
      const sh = getSheet(EMP);
      const map = new Map(readEmployeeRows().map(o => [safeId(o.code), o]));
      let n = 0;
      (body.rows || []).forEach(p => {
        const code = String(p.code || '').trim();
        const name = String(p.name || '').trim();
        const id = safeId(code);
        if (!id || !name) return;
        const values = [code, name, String(p.dept || '').trim()];
        const existing = map.get(id);
        if (existing) {
          sh.getRange(existing._row, 1, 1, 3).setValues([values]);
        } else {
          sh.appendRow(values);
          map.set(id, { code: code, _row: sh.getLastRow() });
        }
        n++;
      });
      return { count: n };
    }

    case 'deleteEmployee': {
      requireSupervisor(body.pinHash);
      const emp = findEmp(safeId(body.id));
      if (emp) getSheet(EMP).deleteRow(emp._row);
      return { ok: true };
    }

    default:
      throw new Error('ไม่รู้จักคำสั่ง: ' + body.action);
  }
}

/* ---------- การอ่าน/เขียนชีต ---------- */

function getSheet(def) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    // ตั้งเป็นข้อความทั้งหมด เพื่อกันไม่ให้ Sheets แปลงวันที่/เวลาเอง
    sh.getRange(1, 1, sh.getMaxRows(), def.head.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows(def) {
  const values = getSheet(def).getDataRange().getValues();
  if (values.length < 2) return [];
  const keys = values[0];
  return values.slice(1)
    .map((row, i) => {
      const o = { _row: i + 2 };
      keys.forEach((k, j) => { o[k] = row[j] instanceof Date ? row[j].toISOString() : row[j]; });
      return o;
    })
    .filter(o => String(o[keys[0]]).trim() !== '');
}

function readEmployeeRows() {
  return readRows(EMP);
}

function readEmployees() {
  return readEmployeeRows().map(o => ({
    id: safeId(o.code),
    code: String(o.code),
    name: String(o.name || ''),
    dept: String(o.dept || '')
  }));
}

function readAttendance() {
  return readRows(ATT).map(o => ({
    _row: o._row,
    docId: String(o.docId),
    date: normDate(o.date),
    empId: String(o.empId),
    code: String(o.code || ''),
    name: String(o.name || ''),
    dept: String(o.dept || ''),
    checkIn: o.checkIn || null,
    checkOut: o.checkOut || null,
    confirmed: o.confirmed === true || String(o.confirmed).toUpperCase() === 'TRUE',
    confirmedAt: o.confirmedAt || null,
    signature: o.signature || null
  }));
}

function findEmp(id) {
  return readEmployeeRows().find(o => safeId(o.code) === id) || null;
}

function findAtt(docId) {
  return readAttendance().find(r => r.docId === docId) || null;
}

function getSetting(key) {
  const r = readRows(SET).find(x => x.key === key);
  return r ? String(r.value) : null;
}

function setSetting(key, value) {
  const sh = getSheet(SET);
  const r = readRows(SET).find(x => x.key === key);
  if (r) sh.getRange(r._row, 2).setValue(value);
  else sh.appendRow([key, value]);
}

/* ---------- ตัวช่วย ---------- */

function requireSupervisor(pinHash) {
  const stored = getSetting('pinHash');
  if (!stored || pinHash !== stored) throw new Error('PIN หัวหน้างานไม่ถูกต้อง');
}

function colOf(def, key) {
  return def.head.indexOf(key) + 1;
}

function safeId(s) {
  return String(s == null ? '' : s).trim().replace(/[^A-Za-z0-9_-]/g, '_');
}

function checkDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) throw new Error('วันที่ไม่ถูกต้อง');
  return String(d);
}

function normDate(v) {
  const s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? s : Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
