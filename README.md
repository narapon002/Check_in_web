# เว็บเช็คชื่อพนักงาน

**เวอร์ชันปัจจุบัน: 2.0.0**

เว็บ: https://narapon002.github.io/Check_in_web/

ใช้ **Supabase** เป็นทั้งระบบล็อกอิน (Google) และฐานข้อมูล หน้าเว็บเป็นไฟล์ `index.html` ไฟล์เดียว โฮสต์บน GitHub Pages ใช้ได้ทั้งคอมและมือถือ

## ประวัติการเปลี่ยนแปลง

- **2.0.0**
  - ย้ายระบบไป Supabase: ล็อกอินด้วยบัญชี Google และเก็บข้อมูลใน Postgres แทน Google Sheets / Apps Script
  - เข้าใช้ได้เฉพาะบัญชีที่อยู่ในตาราง `allowed_users` (ตอนนี้คือ narapon002@gmail.com) ป้องกันด้วย Row Level Security
  - หน้าบันทึกเวลา: ปุ่มเข้างาน/ออกงานรายคน การ์ดสรุป (เข้างาน, สาย, ยังไม่มา, รอยืนยัน) ค้นหาและกรองรายชื่อ ดูย้อนหลังรายวัน
  - แก้ไขเวลาเข้า-ออกย้อนหลังพร้อมหมายเหตุ
  - ตั้งเวลาเข้างาน/เลิกงานได้ในหน้า "ตั้งค่า"
  - ปิดใช้งานพนักงานได้โดยไม่ลบประวัติ
  - ดาวน์โหลดสรุปรายเดือนเป็นไฟล์ CSV (เปิดใน Excel / Google Sheets ได้)
  - คำนวณเวลาสายตามเวลาประเทศไทยเสมอ ไม่ขึ้นกับเขตเวลาของเครื่อง
- **1.2.2** เพิ่มข้อความ "ยินดีต้อนรับ" ที่หน้าแรก
- **1.2.1** ฟอนต์ IBM Plex Sans Thai และโทนสีสุภาพ
- **1.2.0** ธีมพาสเทล
- **1.1.0** ลายเซ็นอนุมัติ, ตัวเลขสายสีแดง, กราฟแท่ง, Google Sheets
- **1.0.0** เวอร์ชันแรก

## ไฟล์

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `index.html` | หน้าเว็บ (มี URL และคีย์สาธารณะของ Supabase อยู่แล้ว) |
| `supabase/schema.sql` | โครงสร้างตารางและสิทธิ์ (RLS) ใช้สร้างฐานข้อมูลใหม่ |
| `employees.csv` | รายชื่อพนักงานชุดเดิม (นำเข้า Supabase แล้ว) |
| `README.md` | ไฟล์นี้ |

## โครงสร้างข้อมูลใน Supabase

| ตาราง | เก็บอะไร |
|---|---|
| `employees` | รหัส, ชื่อ, แผนก, สถานะใช้งาน |
| `attendance` | วันที่, พนักงาน, เวลาเข้า, เวลาออก, การยืนยัน, ลายเซ็น, หมายเหตุ (หนึ่งแถวต่อคนต่อวัน) |
| `settings` | เวลาเข้างานและเลิกงาน |
| `allowed_users` | อีเมลที่มีสิทธิ์ใช้งาน |

โปรเจกต์ Supabase: `check-in-web` (ref `dnryvbvbcnnodaltleco`, ภูมิภาคสิงคโปร์)

## ตั้งค่าล็อกอิน Google (ทำครั้งเดียว)

1. **Google Cloud Console** > APIs & Services > Credentials > Create credentials > OAuth client ID
   - Application type: Web application
   - Authorized JavaScript origins: `https://narapon002.github.io`
   - Authorized redirect URIs: `https://dnryvbvbcnnodaltleco.supabase.co/auth/v1/callback`
   - (ครั้งแรกต้องตั้งค่า OAuth consent screen ก่อน เลือก External แล้วเพิ่ม narapon002@gmail.com เป็น Test user)
2. **Supabase** > Authentication > Sign In / Providers > Google > เปิดใช้งาน แล้ววาง Client ID และ Client Secret
3. **Supabase** > Authentication > URL Configuration
   - Site URL: `https://narapon002.github.io/Check_in_web/`
   - Redirect URLs: เพิ่ม `https://narapon002.github.io/Check_in_web/`

## เพิ่มผู้มีสิทธิ์ใช้งาน

ใน Supabase > SQL Editor:

```sql
insert into public.allowed_users (email) values ('อีเมล@gmail.com');
```

## ความปลอดภัย

- คีย์ `sb_publishable_...` ในหน้าเว็บเป็นคีย์สาธารณะ ใส่ในหน้าเว็บได้ ข้อมูลถูกป้องกันด้วย Row Level Security
- ใครก็กดล็อกอินด้วย Google ได้ แต่บัญชีที่ไม่อยู่ใน `allowed_users` จะถูกออกจากระบบทันทีและอ่าน/เขียนข้อมูลไม่ได้
- ห้ามใส่คีย์ `service_role` หรือ secret key ในหน้าเว็บ

## ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| กดล็อกอินแล้วขึ้น "Unsupported provider" | ยังไม่ได้เปิด Google provider ใน Supabase |
| ล็อกอินแล้วกลับมาที่ localhost หรือหน้าผิด | ตั้ง Site URL และ Redirect URLs ใน Supabase ให้ตรงกับเว็บ |
| Google แจ้ง redirect_uri_mismatch | Redirect URI ใน Google Cloud ต้องเป็น `https://dnryvbvbcnnodaltleco.supabase.co/auth/v1/callback` |
| "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" | เพิ่มอีเมลในตาราง `allowed_users` |
