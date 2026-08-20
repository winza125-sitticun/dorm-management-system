import React, { useState, useEffect } from 'react';
import { Settings, UserProfile } from '../types.ts';
import { 
 Settings as SettingsIcon, 
 Building, 
 Zap, 
 Droplet, 
 Calendar, 
 QrCode, 
 User, 
 CheckCircle,
 AlertTriangle,
 Save,
 HelpCircle,
 MessageSquare,
 Copy,
 Check,
 Terminal,
 RefreshCw,
 ToggleLeft,
 ToggleRight,
 UserPlus,
 Trash2,
 ShieldCheck,
 ShieldAlert,
 FileSpreadsheet,
 ExternalLink,
 Link2,
 Sparkles,
 Lock,
 KeyRound,
 Download,
 Type
} from 'lucide-react';
import { motion } from 'motion/react';
import { zipSync, strToU8 } from 'fflate';
import { getApiErrorMessage, readApiError, unwrapApiData } from '../utils/api.ts';
import { extractSpreadsheetId, isValidSpreadsheetId, normalizeFontScale, parseNumberOrFallback, type FontScale } from '../utils/settings.ts';
import { validatePasswordPolicy } from '../utils/passwordPolicy.ts';
import { hasAppPermission, PERMISSION_CATALOG, PERMISSIONS, permissionsForRole, ROLE_LABELS } from '../constants/permissions.ts';
import { hasPlanFeature, normalizeSubscriptionPlan } from '../constants/planEntitlements.ts';
import type { UserRole } from '../types.ts';
import { RecurringChargesSettings } from './RecurringChargesSettings.tsx';
import { BackupRestoreSettings } from './BackupRestoreSettings.tsx';
import { WhiteLabelSettingsSection } from './WhiteLabelSettingsSection.tsx';
import { LicenseSettings } from './LicenseSettings.tsx';
import { normalizeWhiteLabelDraft, validateLogoFileMeta, type NormalizedWhiteLabelDraft } from '../utils/whiteLabelSettings.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface SettingsViewProps {
 settings: Settings | null;
 loading: boolean;
 onUpdateSettings: (settingsData: Omit<Settings, 'id'>) => Promise<void>;
 idToken?: string | null;
 userProfile?: UserProfile | null;
 onRestoreSuccess?: () => Promise<void> | void;
 onRefreshSettings?: () => Promise<void>;
 showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
 settings,
 loading,
 onUpdateSettings,
 idToken,
 userProfile,
 onRestoreSuccess,
 onRefreshSettings,
 showToast
}) => {
 const role = String(userProfile?.role || '').toLowerCase();
 const isOwnerOrAdmin = role === 'owner' || role === 'super_admin';
 const subscriptionPlan = normalizeSubscriptionPlan(userProfile?.subscriptionPlan ?? settings?.subscriptionPlan);
 const canManageSettingsByRole = hasAppPermission(role, userProfile?.permissions, PERMISSIONS.MANAGE_SETTINGS);
 const canManageSettings = canManageSettingsByRole && hasPlanFeature(subscriptionPlan, 'settings');
 const canUsePromptPay = canManageSettingsByRole && hasPlanFeature(subscriptionPlan, 'promptPay');
 const canEditWhiteLabel = isOwnerOrAdmin && hasPlanFeature(subscriptionPlan, 'whiteLabel');
 const whiteLabelLockReason = !hasPlanFeature(subscriptionPlan, 'whiteLabel')
  ? 'White-label ปิดใช้งานใน Demo'
  : !isOwnerOrAdmin
   ? 'เฉพาะเจ้าของหอพัก/Admin เท่านั้นที่แก้ไข White-label ได้'
   : null;
 const { refreshBranding } = useTheme();
 const canUseGoogleSheets = canManageSettingsByRole && hasPlanFeature(subscriptionPlan, 'googleSheets');
 const canUseLineIntegration = canManageSettingsByRole && hasPlanFeature(subscriptionPlan, 'lineIntegration');
 const canManageRecurringCharges = hasAppPermission(role, userProfile?.permissions, PERMISSIONS.MANAGE_RECURRING_CHARGES) && hasPlanFeature(subscriptionPlan, 'recurringCharges');
 const canManageStaff = isOwnerOrAdmin && hasPlanFeature(subscriptionPlan, 'staff');
 const canExportData = isOwnerOrAdmin && hasPlanFeature(subscriptionPlan, 'contracts');
 
 const [dormName, setDormName] = useState('');
 const [brandColor, setBrandColor] = useState('');
 const [contactPhone, setContactPhone] = useState('');
 const [billFooter, setBillFooter] = useState('');
 const [pendingLogoDataUri, setPendingLogoDataUri] = useState<string | null>(null);
 const [brandingRefreshWarning, setBrandingRefreshWarning] = useState<string | null>(null);
 const [logoMutationPending, setLogoMutationPending] = useState(false);
 const [defaultElecRate, setDefaultElecRate] = useState('');
 const [defaultWaterRate, setDefaultWaterRate] = useState('');
 const [defaultDueDateDay, setDefaultDueDateDay] = useState('');
 const [defaultPenaltyRate, setDefaultPenaltyRate] = useState('');
 const [promptpayId, setPromptpayId] = useState('');
 const [promptpayName, setPromptpayName] = useState('');
 const [lineChannelAccessToken, setLineChannelAccessToken] = useState('');
 const [lineChannelSecret, setLineChannelSecret] = useState('');
 const [lineTokenConfigured, setLineTokenConfigured] = useState(false);
 const [lineSecretConfigured, setLineSecretConfigured] = useState(false);
 const [removeLineToken, setRemoveLineToken] = useState(false);
 const [removeLineSecret, setRemoveLineSecret] = useState(false);
 const [lineBotEnabled, setLineBotEnabled] = useState(false);
 const [googleSpreadsheetId, setGoogleSpreadsheetId] = useState('');
 const [fontScale, setFontScale] = useState<FontScale>('medium');
 const [googleConnected, setGoogleConnected] = useState(false);
 const [googleStatusLoading, setGoogleStatusLoading] = useState(false);

 const [sheetSuccessMessage, setSheetSuccessMessage] = useState<string | null>(null);
 const [sheetErrorMessage, setSheetErrorMessage] = useState<string | null>(null);

 const [lineLogs, setLineLogs] = useState<any[]>([]);
 const [copied, setCopied] = useState(false);
 const [formError, setFormError] = useState<string | null>(null);
 const [formSuccess, setFormSuccess] = useState(false);
 const [submitting, setSubmitting] = useState(false);

 const [caretakers, setCaretakers] = useState<any[]>([]);
 const safeCaretakers = Array.isArray(caretakers) ? caretakers : [];
 const safeLineLogs = Array.isArray(lineLogs) ? lineLogs : [];
 const [caretakersLoading, setCaretakersLoading] = useState(false);
 const [newCaretakerEmail, setNewCaretakerEmail] = useState('');
 const [newCaretakerPassword, setNewCaretakerPassword] = useState('');
 const [newCaretakerRole, setNewCaretakerRole] = useState<UserRole>('caretaker');
 const [newCaretakerPermissions, setNewCaretakerPermissions] = useState<string[]>(permissionsForRole('caretaker'));
 const [caretakerError, setCaretakerError] = useState<string | null>(null);
 const [caretakerSuccess, setCaretakerSuccess] = useState<string | null>(null);
 const [addingCaretaker, setAddingCaretaker] = useState(false);
 // Caretaker editing states
 const [editingCaretakerId, setEditingCaretakerId] = useState<number | null>(null);
 const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
 const [editingRole, setEditingRole] = useState<UserRole>('caretaker');
 const [editingPassword, setEditingPassword] = useState('');
 const [savingCaretakerId, setSavingCaretakerId] = useState<number | null>(null);

 // Backup Export state
 const [isExportingAll, setIsExportingAll] = useState(false);

 const escapeCSVValue = (val: any) => {
 if (val === null || val === undefined) return '""';
 // Prevent spreadsheet applications from evaluating user-entered text as a formula.
 const raw = String(val);
 const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
 const str = safe.replace(/"/g, '""');
 return `"${str}"`;
 };

 const makeCSV = (headers: string[], rows: string[][]) => {
 return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
 };

 const downloadBlob = (filename: string, blob: Blob) => {
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = filename;
 link.click();
 setTimeout(() => URL.revokeObjectURL(url), 0);
 };

 const fetchExportData = async () => {
 const headers = { 'Authorization': `Bearer ${idToken}` };
 const endpoints = [
 ['rooms', '/api/rooms'],
 ['bills', '/api/bills'],
 ['maintenanceTickets', '/api/maintenance'],
 ['leaseContracts', '/api/contracts'],
 ['announcements', '/api/announcements'],
 ] as const;
 const responses = await Promise.all(endpoints.map(([, url]) => fetch(url, { headers })));
 const datasets: Record<string, any[]> = {};
 for (let index = 0; index < responses.length; index += 1) {
 const response = responses[index];
 const [key] = endpoints[index];
 if (!response.ok) throw new Error(await readApiError(response, `ไม่สามารถดึงข้อมูล ${key} ได้`));
 const list = unwrapApiData<any[]>(await response.json());
 if (!Array.isArray(list)) throw new Error(`รูปแบบข้อมูล ${key} ไม่ถูกต้อง`);
 datasets[key] = list;
 }

 const notes: any[] = [];
 for (let offset = 0; offset <= 5_000; offset += 100) {
 const response = await fetch(`/api/notes?limit=100&offset=${offset}`, { headers });
 if (!response.ok) throw new Error(await readApiError(response, 'ไม่สามารถดึงข้อมูลโน้ตได้'));
 const page = unwrapApiData<any[]>(await response.json());
 if (!Array.isArray(page)) throw new Error('รูปแบบข้อมูล notes ไม่ถูกต้อง');
 if (offset === 5_000 && page.length > 0) throw new Error('มีโน้ตมากกว่า 5,000 รายการ กรุณาติดต่อผู้ดูแลระบบเพื่อส่งออกข้อมูลขนาดใหญ่');
 notes.push(...page);
 if (page.length < 100) break;
 }
 datasets.notes = notes;
 return datasets;
 };

 const handleExportAllCSV = async () => {
 setIsExportingAll(true);
 try {
 const datasets = await fetchExportData();
 const roomsData = datasets.rooms;
 const billsData = datasets.bills;
 const maintenanceData = datasets.maintenanceTickets;
 const contractsData = datasets.leaseContracts;
 const announcementsData = datasets.announcements;
 const notesData = datasets.notes;
 const todayStr = new Date().toISOString().substring(0, 10);
 const files: Record<string, Uint8Array> = {};

 // 1. Rooms CSV
 if (roomsData.length > 0) {
 const roomHeaders = ['ID', 'เลขห้อง', 'ค่าเช่าต่อเดือน', 'สถานะ', 'ชื่อผู้เช่า', 'เบอร์ผู้เช่า'];
 const roomRows = roomsData.map((r: any) => [
 escapeCSVValue(r.id),
 escapeCSVValue(r.roomNumber),
 escapeCSVValue(r.monthlyRent),
 escapeCSVValue(r.status === 'occupied' ? 'มีผู้เช่า' : 'ห้องว่าง'),
 escapeCSVValue(r.tenantName || '-'),
 escapeCSVValue(r.tenantPhone || '-'),
 ]);
 files['rooms.csv'] = strToU8(makeCSV(roomHeaders, roomRows));
 }

 // 2. Bills CSV
 if (billsData.length > 0) {
 const billHeaders = ['ID', 'ID ห้อง', 'ประจำเดือน', 'มิเตอร์ไฟเดิม', 'มิเตอร์ไฟใหม่', 'หน่วยไฟ', 'ค่าไฟ', 'มิเตอร์น้ำเดิม', 'มิเตอร์น้ำใหม่', 'หน่วยน้ำ', 'ค่าน้ำ', 'ค่าเช่า', 'เงินประกัน', 'ค่าอื่นๆ', 'คำอธิบายค่าอื่นๆ', 'รายละเอียดรายการค่าบริการ', 'ยอดรวม', 'กำหนดจ่าย', 'สถานะ', 'วันที่จ่าย'];
 const billRows = billsData.map((b: any) => [
 escapeCSVValue(b.id),
 escapeCSVValue(b.roomId),
 escapeCSVValue(b.billMonth),
 escapeCSVValue(b.priorElec),
 escapeCSVValue(b.currentElec),
 escapeCSVValue(Math.max(0, b.currentElec - b.priorElec)),
 escapeCSVValue(b.elecCost),
 escapeCSVValue(b.priorWater),
 escapeCSVValue(b.currentWater),
 escapeCSVValue(Math.max(0, b.currentWater - b.priorWater)),
 escapeCSVValue(b.waterCost),
 escapeCSVValue(b.rentCost),
 escapeCSVValue(b.depositCost),
 escapeCSVValue(b.otherCost),
 escapeCSVValue(b.otherDescription || ''),
 escapeCSVValue((b.chargeItems || []).map((item: any) => `${item.label}: ${item.amount}`).join(' | ')),
 escapeCSVValue(b.totalCost),
 escapeCSVValue(b.dueDate),
 escapeCSVValue(b.status === 'paid' ? 'จ่ายแล้ว' : 'ค้างจ่าย'),
 escapeCSVValue(b.paidAt || '-')
 ]);
 files['bills.csv'] = strToU8(makeCSV(billHeaders, billRows));
 }

 // 3. Maintenance CSV
 if (maintenanceData.length > 0) {
 const mHeaders = ['ID', 'เลขห้อง', 'ผู้เช่า', 'หัวข้อแจ้งซ่อม', 'รายละเอียด', 'หมวดหมู่', 'ความสำคัญ', 'สถานะ', 'ค่าซ่อม'];
 const mRows = maintenanceData.map((m: any) => [
 escapeCSVValue(m.id),
 escapeCSVValue(m.roomNumber),
 escapeCSVValue(m.tenantName || '-'),
 escapeCSVValue(m.title),
 escapeCSVValue(m.description || '-'),
 escapeCSVValue(m.category),
 escapeCSVValue(m.priority),
 escapeCSVValue(m.status),
 escapeCSVValue(m.repairCost || 0)
 ]);
 files['maintenance.csv'] = strToU8(makeCSV(mHeaders, mRows));
 }

 // 4. Contracts CSV
 if (contractsData.length > 0) {
 const cHeaders = ['ID', 'เลขห้อง', 'ชื่อผู้เช่า', 'เบอร์โทร', 'เลขบัตรประชาชน', 'วันเริ่มสัญญา', 'วันสิ้นสุด', 'ค่าเช่า', 'เงินประกัน', 'ค่าเช่าล่วงหน้า', 'สถานะ'];
 const cRows = contractsData.map((c: any) => [
 escapeCSVValue(c.id),
 escapeCSVValue(c.roomNumber),
 escapeCSVValue(c.tenantName),
 escapeCSVValue(c.tenantPhone || '-'),
 escapeCSVValue(c.idCardNumber || '-'),
 escapeCSVValue(c.startDate),
 escapeCSVValue(c.endDate),
 escapeCSVValue(c.monthlyRent),
 escapeCSVValue(c.depositAmount),
 escapeCSVValue(c.advanceRentAmount),
 escapeCSVValue(c.status)
 ]);
 files['contracts.csv'] = strToU8(makeCSV(cHeaders, cRows));
 }

 if (announcementsData.length > 0) {
 const headers = ['ID', 'หัวข้อ', 'เนื้อหา', 'หมวดหมู่', 'ปักหมุด', 'ห้องเป้าหมาย', 'วันที่สร้าง'];
 const rows = announcementsData.map((item: any) => [
 escapeCSVValue(item.id), escapeCSVValue(item.title), escapeCSVValue(item.content),
 escapeCSVValue(item.category), escapeCSVValue(item.isPinned ? 'ใช่' : 'ไม่'),
 escapeCSVValue(item.targetRoomIds || ''), escapeCSVValue(item.createdAt || ''),
 ]);
 files['announcements.csv'] = strToU8(makeCSV(headers, rows));
 }

 if (notesData.length > 0) {
 const headers = ['ID', 'หัวข้อ', 'รายละเอียด', 'ห้องพัก', 'สี', 'ปักหมุด', 'ผู้สร้าง', 'วันที่สร้าง', 'แก้ไขล่าสุด'];
 const rows = notesData.map((item: any) => [
 escapeCSVValue(item.id), escapeCSVValue(item.title), escapeCSVValue(item.content),
 escapeCSVValue(item.roomNumber || ''), escapeCSVValue(item.color),
 escapeCSVValue(item.isPinned ? 'ใช่' : 'ไม่'), escapeCSVValue(item.createdByEmail || ''),
 escapeCSVValue(item.createdAt || ''), escapeCSVValue(item.updatedAt || ''),
 ]);
 files['notes.csv'] = strToU8(makeCSV(headers, rows));
 }

 files['manifest.json'] = strToU8(JSON.stringify({
 schemaVersion: 1,
 exportedAt: new Date().toISOString(),
 counts: Object.fromEntries(Object.entries(datasets).map(([key, value]) => [key, value.length])),
 }, null, 2));

 const zipped = zipSync(files, { level: 6 });
 downloadBlob(`dorm_data_export_${todayStr}.zip`, new Blob([zipped], { type: 'application/zip' }));

 alert('ส่งออกข้อมูล CSV เป็นไฟล์ ZIP สำเร็จแล้วค่ะ');
 } catch (err: any) {
 console.error("Export CSV error:", err);
 alert('เกิดข้อผิดพลาดในการส่งออกไฟล์ CSV: ' + err.message);
 } finally {
 setIsExportingAll(false);
 }
 };

  const startEditingCaretaker = (ct: any) => {
    setEditingCaretakerId(ct.id);
    const nextRole = (ct.role || 'caretaker') as UserRole;
    const perms = ct.permissions ? ct.permissions.split(',') : permissionsForRole(nextRole);
    setEditingRole(nextRole);
    setEditingPermissions(perms);
    setEditingPassword('');
  };

  const handleSaveCaretaker = async (ctId: number) => {
    const trimmedPw = editingPassword.trim();
    const passwordCheck = trimmedPw ? validatePasswordPolicy(trimmedPw) : { isValid: true };
    if (!passwordCheck.isValid) {
      setCaretakerError(passwordCheck.error || 'รหัสผ่านไม่ผ่านเงื่อนไขความปลอดภัย');
      return;
    }
    setSavingCaretakerId(ctId);
    setCaretakerError(null);
    setCaretakerSuccess(null);
    try {
      const bodyPayload: any = {
        role: editingRole,
        permissions: editingPermissions.join(',')
      };
      if (trimmedPw !== '') {
        bodyPayload.password = trimmedPw;
      }
      const res = await fetch(`/api/caretakers/${ctId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, 'ไม่สามารถอัปเดตผู้ดูแลร่วมได้'));
      }
      setCaretakerSuccess(`อัปเดตสิทธิ์${trimmedPw ? 'และตั้งรหัสผ่านใหม่' : ''}ของผู้ดูแลเรียบร้อยแล้วค่ะ`);
      setEditingCaretakerId(null);
      setEditingPassword('');
      await fetchCaretakers();
    } catch (err: any) {
      setCaretakerError(err.message);
    } finally {
      setSavingCaretakerId(null);
    }
  };

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (!currentPassword) {
      setPwError('กรุณากรอกรหัสผ่านปัจจุบัน');
      return;
    }
    const policyResult = validatePasswordPolicy(newPassword);
    if (!policyResult.isValid) {
      setPwError(policyResult.error || 'รหัสผ่านใหม่ไม่ผ่านเงื่อนไขความปลอดภัย');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('รหัสผ่านใหม่และยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }

    try {
      setPwSubmitting(true);
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, 'ไม่สามารถเปลี่ยนรหัสผ่านได้'));
      }
      setPwSuccess('เปลี่ยนรหัสผ่านใหม่สำเร็จแล้วค่ะ!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setPwSubmitting(false);
    }
  };

  // Fetch caretakers list
  const fetchCaretakers = async () => {
    if (!idToken || !canManageStaff) return;
    try {
      setCaretakersLoading(true);
      const res = await fetch('/api/caretakers', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = unwrapApiData<any[]>(await res.json());
        const caretakersList = Array.isArray(data) ? data : [];
        setCaretakers(caretakersList);
      }
    } catch (err) {
      console.error("Failed to fetch caretakers:", err);
      setCaretakers([]);
    } finally {
      setCaretakersLoading(false);
    }
  };

  useEffect(() => {
    fetchCaretakers();
  }, [idToken, userProfile]);

  const handleAddCaretaker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaretakerEmail) return;
    const policyResult = validatePasswordPolicy(newCaretakerPassword.trim());
    if (!policyResult.isValid) {
      setCaretakerError(policyResult.error || 'รหัสผ่านไม่ผ่านเงื่อนไขความปลอดภัย');
      return;
    }
    setCaretakerError(null);
    setCaretakerSuccess(null);
    setAddingCaretaker(true);
    try {
      const res = await fetch('/api/caretakers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ 
          email: newCaretakerEmail.trim(),
          password: newCaretakerPassword.trim(),
          role: newCaretakerRole,
          permissions: newCaretakerPermissions.join(',')
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, 'ไม่สามารถเพิ่มผู้ดูแลร่วมได้'));
      }
      setCaretakerSuccess(`เพิ่มผู้ดูแลร่วมชื่อ "${newCaretakerEmail.trim()}" สำเร็จแล้วค่ะ! ผู้ดูแลสามารถล็อกอินด้วยชื่อนี้พร้อมกับรหัสผ่านที่ตั้งไว้ได้ทันที`);
      setNewCaretakerEmail('');
      setNewCaretakerPassword('');
      setNewCaretakerRole('caretaker');
      setNewCaretakerPermissions(permissionsForRole('caretaker'));
      await fetchCaretakers();
    } catch (err: any) {
      setCaretakerError(err.message);
    } finally {
      setAddingCaretaker(false);
    }
  };

 const handleRemoveCaretaker = async (id: number) => {
 if (!window.confirm('คุณต้องการยกเลิกสิทธิ์และนำผู้ดูแลร่วมคนนี้ออกจากระบบใช่หรือไม่?')) return;
 setCaretakerError(null);
 setCaretakerSuccess(null);
 try {
 const res = await fetch(`/api/caretakers/${id}`, {
 method: 'DELETE',
 headers: { 'Authorization': `Bearer ${idToken}` }
 });
 const data = await res.json();
 if (!res.ok) {
 throw new Error(getApiErrorMessage(data, 'ไม่สามารถนำผู้ดูแลร่วมออกได้'));
 }
 setCaretakerSuccess('นำผู้ดูแลร่วมออกจากระบบเรียบร้อยแล้ว');
 fetchCaretakers();
 } catch (err: any) {
 setCaretakerError(err.message);
 }
 };

 // Initialize fields
 useEffect(() => {
 if (settings) {
 setDormName(settings.dormName || '');
 setBrandColor(settings.brandColor || '');
 setContactPhone(settings.contactPhone || '');
 setBillFooter(settings.billFooter || '');
 setPendingLogoDataUri(null);
 setDefaultElecRate(settings.defaultElecRate != null ? String(settings.defaultElecRate) : '7');
 setDefaultWaterRate(settings.defaultWaterRate != null ? String(settings.defaultWaterRate) : '13');
 setDefaultDueDateDay(settings.defaultDueDateDay != null ? String(settings.defaultDueDateDay) : '5');
 setDefaultPenaltyRate(settings.defaultPenaltyRate != null ? String(settings.defaultPenaltyRate) : '100');
 setPromptpayId(settings.promptpayId || '');
 setPromptpayName(settings.promptpayName || '');
 setLineChannelAccessToken('');
 setLineChannelSecret('');
 setLineTokenConfigured(!!settings.lineTokenConfigured);
 setLineSecretConfigured(!!settings.lineSecretConfigured);
 setRemoveLineToken(false);
 setRemoveLineSecret(false);
 setLineBotEnabled(settings.lineBotEnabled === 1 || settings.lineBotEnabled === true);
 setGoogleSpreadsheetId(extractSpreadsheetId(settings.googleSpreadsheetId || ''));
 setFontScale(normalizeFontScale(settings.fontScale));
 }
 }, [settings]);

 useEffect(() => {
 if (!idToken || !canUseGoogleSheets) return;
 let cancelled = false;
 const fetchGoogleStatus = async () => {
 setGoogleStatusLoading(true);
 try {
 const response = await fetch('/api/google-sheets/status', { headers: { 'Authorization': `Bearer ${idToken}` } });
 if (!response.ok) throw new Error(await readApiError(response, 'ตรวจสอบสถานะ Google Sheets ไม่สำเร็จ'));
 const status = unwrapApiData<{ connected: boolean }>(await response.json());
 if (!cancelled) setGoogleConnected(!!status.connected);
 } catch (error) {
 if (!cancelled) setSheetErrorMessage(error instanceof Error ? error.message : 'ตรวจสอบสถานะ Google Sheets ไม่สำเร็จ');
 } finally {
 if (!cancelled) setGoogleStatusLoading(false);
 }
 };
 fetchGoogleStatus();
 if (new URLSearchParams(window.location.search).get('googleSheets') === 'connected') {
 setSheetSuccessMessage('เชื่อมต่อ Google Sheets สำเร็จแล้ว');
 const cleanUrl = `${window.location.pathname}${window.location.hash}`;
 window.history.replaceState({}, '', cleanUrl);
 }
 return () => { cancelled = true; };
 }, [idToken, canUseGoogleSheets]);

 const buildSettingsPayload = (spreadsheetId = googleSpreadsheetId, whiteLabelOverride?: NormalizedWhiteLabelDraft): Omit<Settings, 'id'> => ({
 dormName: whiteLabelOverride?.dormName ?? (dormName || 'หอพักของฉัน'),
 defaultElecRate: parseNumberOrFallback(defaultElecRate, 7),
 defaultWaterRate: parseNumberOrFallback(defaultWaterRate, 13),
 defaultDueDateDay: parseNumberOrFallback(defaultDueDateDay, 5),
 defaultPenaltyRate: parseNumberOrFallback(defaultPenaltyRate, 100),
 promptpayId: promptpayId || '',
 promptpayName: promptpayName || '',
 lineChannelAccessToken: removeLineToken ? null : (lineChannelAccessToken.trim() || undefined),
 lineChannelSecret: removeLineSecret ? null : (lineChannelSecret.trim() || undefined),
 lineBotEnabled,
 googleSpreadsheetId: spreadsheetId || '',
 ...(canEditWhiteLabel ? {
  brandColor: whiteLabelOverride?.brandColor ?? (brandColor || null),
  contactPhone: whiteLabelOverride?.contactPhone ?? (contactPhone || null),
  billFooter: whiteLabelOverride?.billFooter ?? (billFooter || null),
 } : {}),
 ...(isOwnerOrAdmin ? { fontScale } : {})
 });

 const selectFontScale = (nextScale: FontScale) => setFontScale(nextScale);

 // Periodic log polling
 useEffect(() => {
 if (!idToken || !lineBotEnabled || !canUseLineIntegration) {
 setLineLogs([]);
 return;
 }

 const fetchLogs = async () => {
 try {
 const res = await fetch('/api/line/logs', {
 headers: {
 'Authorization': `Bearer ${idToken}`
 }
 });
 if (res.ok) {
 const contentType = res.headers.get("content-type");
 if (contentType && contentType.includes("application/json")) {
 const logs = unwrapApiData<any[]>(await res.json());
 setLineLogs(Array.isArray(logs) ? logs : []);
 }
 }
 } catch (err) {
 // Silently catch network failures during server boot or token refreshes
 }
 };

 fetchLogs();
 const interval = setInterval(fetchLogs, 10000);
 return () => clearInterval(interval);
 }, [idToken, lineBotEnabled, canUseLineIntegration]);

 const handleCopyWebhook = () => {
 const url = `${window.location.origin}/api/line/webhook`;
 navigator.clipboard.writeText(url);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 const readFileAsDataUri = (file: File): Promise<string> => new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result || ''));
 reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์โลโก้ได้'));
 reader.readAsDataURL(file);
 });

 const handleUploadLogo = async (file: File) => {
 if (!canEditWhiteLabel || logoMutationPending) return;
 const meta = validateLogoFileMeta(file);
 if (meta.ok === false) {
  setFormError(meta.error);
  return;
 }
 setFormError(null);
 setBrandingRefreshWarning(null);
 setLogoMutationPending(true);
 try {
  const logoDataUri = await readFileAsDataUri(file);
  setPendingLogoDataUri(logoDataUri);
  const response = await fetch('/api/settings/logo', {
   method: 'PUT',
   headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
   body: JSON.stringify({ logoDataUri }),
  });
  if (!response.ok) throw new Error(await readApiError(response, 'อัปโหลดโลโก้ไม่สำเร็จ'));
  await onRefreshSettings?.();
  const brandingRefreshed = await refreshBranding();
  if (!brandingRefreshed) setBrandingRefreshWarning('อัปโหลดโลโก้แล้ว แต่ยังรีเฟรชแบรนด์บนหน้าจอไม่ได้ กรุณาลองรีเฟรชหน้า');
  setPendingLogoDataUri(null);
  showToast?.('อัปโหลดโลโก้เรียบร้อยแล้ว', 'success');
 } catch (err) {
  setPendingLogoDataUri(null);
  setFormError(err instanceof Error ? err.message : 'อัปโหลดโลโก้ไม่สำเร็จ');
 } finally {
  setLogoMutationPending(false);
 }
 };

 const handleDeleteLogo = async () => {
 if (!canEditWhiteLabel || logoMutationPending) return;
 setFormError(null);
 setBrandingRefreshWarning(null);
 setLogoMutationPending(true);
 try {
  const response = await fetch('/api/settings/logo', {
   method: 'DELETE',
   headers: { 'Authorization': `Bearer ${idToken}` },
  });
  if (!response.ok) throw new Error(await readApiError(response, 'ลบโลโก้ไม่สำเร็จ'));
  setPendingLogoDataUri(null);
  await onRefreshSettings?.();
  const brandingRefreshed = await refreshBranding();
  if (!brandingRefreshed) setBrandingRefreshWarning('ลบโลโก้แล้ว แต่ยังรีเฟรชแบรนด์บนหน้าจอไม่ได้ กรุณาลองรีเฟรชหน้า');
  showToast?.('ลบโลโก้เรียบร้อยแล้ว', 'success');
 } catch (err) {
  setFormError(err instanceof Error ? err.message : 'ลบโลโก้ไม่สำเร็จ');
 } finally {
  setLogoMutationPending(false);
 }
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setFormError(null);
 setFormSuccess(false);
 setBrandingRefreshWarning(null);

 let normalizedWhiteLabel: NormalizedWhiteLabelDraft | undefined;
 if (canEditWhiteLabel) {
  const normalized = normalizeWhiteLabelDraft({ dormName, brandColor, contactPhone, billFooter });
  if (normalized.ok === false) {
   setFormError(normalized.error);
   return;
  }
  normalizedWhiteLabel = normalized.value;
 } else if (!dormName) {
  setFormError('กรุณากรอกชื่อหอพัก/อาคาร');
  return;
 }
 if (!defaultElecRate || parseFloat(defaultElecRate) <= 0) {
 setFormError('กรุณากรอกอัตราค่าไฟต่อหน่วยที่ถูกต้อง');
 return;
 }
 if (!defaultWaterRate || parseFloat(defaultWaterRate) <= 0) {
 setFormError('กรุณากรอกอัตราค่าน้ำต่อหน่วยที่ถูกต้อง');
 return;
 }
 
 const dueDateDay = parseInt(defaultDueDateDay);
 if (!defaultDueDateDay || dueDateDay < 1 || dueDateDay > 31) {
 setFormError('กรุณากรอกวันครบกำหนดชำระที่ถูกต้อง (ระบุระหว่างวันที่ 1-31)');
 return;
 }

 const penaltyRate = parseFloat(defaultPenaltyRate);
 if (isNaN(penaltyRate) || penaltyRate < 0) {
 setFormError('กรุณากรอกอัตราค่าปรับล่าช้าต่อวัน (ระบุอย่างน้อย 0 บาท)');
 return;
 }

 const tokenWillExist = !removeLineToken && (lineTokenConfigured || !!lineChannelAccessToken.trim());
 const secretWillExist = !removeLineSecret && (lineSecretConfigured || !!lineChannelSecret.trim());
 if (lineBotEnabled && (!tokenWillExist || !secretWillExist)) {
 setFormError('ต้องตั้งค่า LINE Channel Access Token และ Channel Secret ก่อนเปิดใช้งานบอท');
 return;
 }

 setSubmitting(true);

 const settingsData = buildSettingsPayload(googleSpreadsheetId, normalizedWhiteLabel);

 try {
 await onUpdateSettings(settingsData);
 const brandingRefreshed = await refreshBranding();
 if (!brandingRefreshed) {
  setBrandingRefreshWarning('บันทึกแล้ว แต่ยังรีเฟรชแบรนด์บนหน้าจอไม่ได้ กรุณาลองรีเฟรชหน้า');
 }
 if (lineChannelAccessToken.trim()) setLineTokenConfigured(true);
 if (lineChannelSecret.trim()) setLineSecretConfigured(true);
 if (removeLineToken) setLineTokenConfigured(false);
 if (removeLineSecret) setLineSecretConfigured(false);
 setLineChannelAccessToken('');
 setLineChannelSecret('');
 setRemoveLineToken(false);
 setRemoveLineSecret(false);
 setFormSuccess(true);
 setTimeout(() => setFormSuccess(false), 4000);
 } catch (err: any) {
 setFormError(err.message || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
 } finally {
 setSubmitting(false);
 }
 };

 const handleSaveSpreadsheetIdOnly = async (idToSave?: string) => {
 const rawVal = idToSave !== undefined ? idToSave : googleSpreadsheetId;
 const targetId = extractSpreadsheetId(rawVal);
 
 if (!isValidSpreadsheetId(targetId)) {
 setSheetErrorMessage('Spreadsheet ID ไม่ถูกต้อง กรุณาวาง ID หรือ URL ของ Google Sheets ที่สมบูรณ์');
 return;
 }

 setSheetErrorMessage(null);
 setSheetSuccessMessage(null);
 setGoogleSpreadsheetId(targetId);

 try {
 const settingsData = buildSettingsPayload(targetId);
 await onUpdateSettings(settingsData);
 setSheetSuccessMessage(`บันทึกและเชื่อมโยง Google Spreadsheet ID (${targetId}) เรียบร้อยแล้วค่ะ!`);
 } catch (err: any) {
 setSheetErrorMessage(err.message || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
 }
 };

 const handleConnectGoogle = async () => {
   try {
     const res = await fetch('/api/google-sheets/connect', {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${idToken}` }
     });
     const data = await res.json();
     if (!res.ok) {
        throw new Error(getApiErrorMessage(data, 'ไม่สามารถเชื่อมต่อ Google ได้'));
     }
     if (data.data?.authorizationUrl) {
       window.location.href = data.data.authorizationUrl;
     }
   } catch (err: any) {
     alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Google: ' + (err.message || String(err)));
   }
 };

 const handleDisconnectGoogle = async () => {
 if (!window.confirm('ยืนยันยกเลิกการเชื่อมต่อ Google Sheets หรือไม่?')) return;
 setGoogleStatusLoading(true);
 setSheetErrorMessage(null);
 try {
 const response = await fetch('/api/google-sheets/disconnect', {
 method: 'POST',
 headers: { 'Authorization': `Bearer ${idToken}` }
 });
 if (!response.ok) throw new Error(await readApiError(response, 'ยกเลิกการเชื่อมต่อไม่สำเร็จ'));
 setGoogleConnected(false);
 setSheetSuccessMessage('ยกเลิกการเชื่อมต่อ Google Sheets แล้ว');
 } catch (error) {
 setSheetErrorMessage(error instanceof Error ? error.message : 'ยกเลิกการเชื่อมต่อไม่สำเร็จ');
 } finally {
 setGoogleStatusLoading(false);
 }
 };

 if (loading && !settings) {
 return (
 <div className="flex justify-center items-center py-20 text-[#6B6B66]">
 <span className="w-6 h-6 border-2 border-[#E0E0DB] border-t-blue-600 rounded-full animate-spin"></span>
 <span className="ml-3 text-sm font-semibold">กำลังโหลดการตั้งค่าระบบ...</span>
 </div>
 );
 }

 const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/line/webhook` : '';
 return (
 <div className="max-w-2xl mx-auto space-y-6 font-sans">
 
 {/* Header Panel */}
 <div>
 <h2 className="text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
 <SettingsIcon className="w-5 h-5 text-[#1DB954]" />
 <span>ตั้งค่าระบบและอัตราหน่วย</span>
 </h2>
 <p className="text-xs text-[#6B6B66] mt-1">
 กำหนดชื่อหอพัก อัตรามิเตอร์ไฟ/น้ำต่อหน่วย และเชื่อมต่อช่องทางการรับชำระเงินผ่าน QR พร้อมเพย์แบบอัจฉริยะ
 </p>
 </div>

 {!isOwnerOrAdmin && (
 <div className="p-4 bg-[#F59B23]/8 border border-amber-200 text-[#F59B23] rounded-2xl text-xs flex items-center gap-2.5 ">
 <ShieldAlert className="w-5 h-5 text-[#F59B23] flex-shrink-0 animate-pulse" />
 <div>
 <p className="font-bold text-amber-900">สถานะบัญชี: {ROLE_LABELS[role as UserRole] || 'พนักงาน'}</p>
 <p className="text-[#6B6B66] mt-0.5">{canManageSettings ? 'คุณได้รับสิทธิ์จัดการการตั้งค่าระบบ แต่การจัดการผู้ดูแลร่วมและการส่งออกข้อมูลยังจำกัดเฉพาะเจ้าของหอพัก' : 'บัญชีนี้ไม่มีสิทธิ์แก้ไขการตั้งค่าระบบ'}</p>
 </div>
 </div>
 )}

 {/* Section: Caretaker Management (Only for Owners & Super Admins) */}
 {canManageStaff && (
 <div className="bg-white border border-[#E0E0DB] rounded-2xl p-6 space-y-6 text-xs text-[#6B6B66]">
 <div>
 <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
 <UserPlus className="w-4.5 h-4.5 text-[#1DB954]" />
 <span>ระบบจัดการผู้ดูแลร่วม (Staff/Caretaker Management)</span>
 </h3>
 <p className="text-[11px] text-[#8A8A85] mt-0.5">
 กำหนดชื่อผู้ใช้ (User ID) พร้อมรหัสผ่านของผู้ดูแลร่วม (เช่น ผู้ดูแลตึก, พนักงาน, แม่บ้าน) เพื่อให้พวกเขาสามารถใช้เข้าสู่ระบบและเริ่มดูแลหอพักร่วมกับคุณตามสิทธิ์ที่ตั้งไว้ได้ทันที
 </p>
 </div>

 {caretakerSuccess && (
 <div className="p-3.5 bg-[#1DB954]/8 border border-[#1DB954]/30 text-[#1DB954] rounded-xl text-[11px] font-medium">
 {caretakerSuccess}
 </div>
 )}

 {caretakerError && (
 <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium">
 {caretakerError}
 </div>
 )}

 {/* Add caretaker form */}
 <form onSubmit={handleAddCaretaker} className="space-y-4 bg-[#F0F0EB] border border-[#E0E0DB] rounded-2xl p-4">
 <h4 className="text-[11px] font-bold text-[#6B6B66] uppercase tracking-wider flex items-center gap-1">
 <UserPlus className="w-3.5 h-3.5 text-[#1DB954]" />
 <span>เพิ่มและตั้งค่าสิทธิ์ผู้ดูแลร่วมรายใหม่</span>
 </h4>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <label className="block font-bold text-[#6B6B66] text-[10px] uppercase tracking-wider">
 ชื่อผู้ใช้ / User ID หรืออีเมลผู้ดูแลร่วม:
 </label>
 <input
 type="text"
 placeholder="ระบุ เช่น staff01 หรือ maid_som"
 value={newCaretakerEmail}
 onChange={(e) => setNewCaretakerEmail(e.target.value)}
 required
 className="w-full bg-white border border-[#E0E0DB] rounded-xl px-4 py-2.5 text-xs text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition font-mono"
 />
 </div>

 <div className="space-y-1.5">
 <label className="block font-bold text-[#6B6B66] text-[10px] uppercase tracking-wider">
 รหัสผ่านเข้าใช้งาน (อย่างน้อย 8 ตัว พร้อมพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ):
 </label>
 <input
 type="password"
 autoComplete="new-password"
 placeholder="เช่น Dorm@2026"
 value={newCaretakerPassword}
 onChange={(e) => setNewCaretakerPassword(e.target.value)}
 required
 className="w-full bg-white border border-[#E0E0DB] rounded-xl px-4 py-2.5 text-xs text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition font-mono"
 />
 </div>
 </div>

 {/* Permissions checklist */}
 <div className="space-y-3 pt-1">
 <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
 <label className="flex-1 text-[10px] font-bold text-[#6B6B66] uppercase tracking-wider">
 บทบาทพนักงาน
 <select
 value={newCaretakerRole}
 onChange={(e) => {
 const nextRole = e.target.value as UserRole;
 setNewCaretakerRole(nextRole);
 setNewCaretakerPermissions(permissionsForRole(nextRole));
 }}
 className="mt-1.5 w-full bg-white border border-[#E0E0DB] rounded-xl px-3 py-2.5 text-xs"
 >
 {(['caretaker', 'accountant', 'technician', 'housekeeper'] as UserRole[]).map((item) => (
 <option key={item} value={item}>{ROLE_LABELS[item]}</option>
 ))}
 </select>
 </label>
 <button type="button" onClick={() => setNewCaretakerPermissions(permissionsForRole(newCaretakerRole))} className="px-3 py-2.5 rounded-xl border border-[#E0E0DB] bg-white text-xs font-bold">
 คืนค่าสิทธิ์ตามบทบาท
 </button>
 </div>
 <label className="block font-bold text-[#6B6B66] text-[10px] uppercase tracking-wider">ปรับสิทธิ์รายคน</label>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {PERMISSION_CATALOG.map((permission) => (
 <label key={permission.key} className="flex gap-2 items-start rounded-lg border border-[#E0E0DB] bg-white p-2.5 cursor-pointer">
 <input type="checkbox" checked={newCaretakerPermissions.includes(permission.key)} onChange={(e) => setNewCaretakerPermissions((current) => e.target.checked ? [...new Set([...current, permission.key])] : current.filter((item) => item !== permission.key))} className="mt-0.5 rounded" />
 <span><span className="block text-xs font-bold text-[#1A1A1A]">{permission.label}</span><span className="block text-[9px] text-[#8A8A85]">{permission.group}</span></span>
 </label>
 ))}
 </div>
 </div>
 <div className="hidden space-y-2 pt-1">
 <label className="block font-bold text-[#6B6B66] text-[10px] uppercase tracking-wider">
 กำหนดสิทธิ์การเข้าถึงข้อมูลของผู้ดูแลร่วมรายนี้:
 </label>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
 <label className="flex items-center gap-2 cursor-pointer py-1.5 px-2 bg-white rounded-lg border border-[#E0E0DB] hover:bg-[#E8E8E3] transition">
 <input
 type="checkbox"
 checked={newCaretakerPermissions.includes('manage_rooms')}
 onChange={(e) => {
 if (e.target.checked) {
 setNewCaretakerPermissions([...newCaretakerPermissions, 'manage_rooms']);
 } else {
 setNewCaretakerPermissions(newCaretakerPermissions.filter(p => p !== 'manage_rooms'));
 }
 }}
 className="rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <span className="text-xs text-slate-700 font-bold">จัดการห้องพัก</span>
 </label>

 <label className="flex items-center gap-2 cursor-pointer py-1.5 px-2 bg-white rounded-lg border border-[#E0E0DB] hover:bg-[#E8E8E3] transition">
 <input
 type="checkbox"
 checked={newCaretakerPermissions.includes('manage_bills')}
 onChange={(e) => {
 if (e.target.checked) {
 setNewCaretakerPermissions([...newCaretakerPermissions, 'manage_bills']);
 } else {
 setNewCaretakerPermissions(newCaretakerPermissions.filter(p => p !== 'manage_bills'));
 }
 }}
 className="rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <span className="text-xs text-slate-700 font-bold">จัดการบิลค่าเช่า</span>
 </label>

 <label className="flex items-center gap-2 cursor-pointer py-1.5 px-2 bg-white rounded-lg border border-[#E0E0DB] hover:bg-[#E8E8E3] transition">
 <input
 type="checkbox"
 checked={newCaretakerPermissions.includes('edit_payments')}
 onChange={(e) => {
 if (e.target.checked) {
 setNewCaretakerPermissions([...newCaretakerPermissions, 'edit_payments']);
 } else {
 setNewCaretakerPermissions(newCaretakerPermissions.filter(p => p !== 'edit_payments'));
 }
 }}
 className="rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <span className="text-xs text-slate-700 font-bold">บันทึกการชำระเงิน</span>
 </label>

 <label className="flex items-center gap-2 cursor-pointer py-1.5 px-2 bg-white rounded-lg border border-[#E0E0DB] hover:bg-[#E8E8E3] transition">
 <input
 type="checkbox"
 checked={newCaretakerPermissions.includes('manage_settings')}
 onChange={(e) => {
 if (e.target.checked) {
 setNewCaretakerPermissions([...newCaretakerPermissions, 'manage_settings']);
 } else {
 setNewCaretakerPermissions(newCaretakerPermissions.filter(p => p !== 'manage_settings'));
 }
 }}
 className="rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <span className="text-xs text-slate-700 font-bold">ตั้งค่าระบบหลัก</span>
 </label>
 </div>
 </div>

 <div className="flex justify-end pt-1">
 <button
 type="submit"
 disabled={addingCaretaker}
 className="px-5 py-2.5 bg-[#1DB954] hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
 >
 {addingCaretaker ? 'กำลังเพิ่ม...' : 'เพิ่มและเปิดใช้งานบัญชีผู้ดูแลร่วม'}
 </button>
 </div>
 </form>

 {/* Caretakers list */}
 <div className="space-y-2.5 pt-2">
 <h4 className="text-[11px] font-bold text-[#8A8A85] uppercase tracking-wider">รายชื่อผู้ดูแลร่วมในระบบ ({caretakers.length})</h4>
 
 {caretakersLoading ? (
 <p className="text-[#8A8A85] text-xs">กำลังโหลดข้อมูลรายชื่อ...</p>
 ) : safeCaretakers.length === 0 ? (
 <div className="text-center py-6 border border-dashed border-[#E0E0DB] rounded-xl text-[#8A8A85] text-[11px]">
 ยังไม่มีผู้ดูแลร่วมในระบบของคุณ
 </div>
 ) : (
 <div className="border border-[#E0E0DB] rounded-xl divide-y divide-slate-200 bg-[#F0F0EB] overflow-hidden">
 {safeCaretakers.map((ct) => {
 const isEditing = editingCaretakerId === ct.id;
 const perms = ct.permissions ? ct.permissions.split(',') : permissionsForRole((ct.role || 'caretaker') as UserRole);
 
 return (
 <div key={ct.id} className="p-3.5 flex flex-col gap-3 text-xs bg-white">
 <div className="flex items-center justify-between w-full">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-full bg-[#1DB954]/8 border border-blue-100 flex items-center justify-center">
 <User className="w-4 h-4 text-[#1DB954]" />
 </div>
 <div>
 <p className="font-semibold text-[#1A1A1A] flex items-center gap-1.5">
 <span>{ct.email}</span>
 <span className="text-[9px] bg-[#F0F0EB] text-slate-600 px-1.5 py-0.5 rounded border border-[#E0E0DB]/50">{ROLE_LABELS[(ct.role || 'caretaker') as UserRole] || ct.role}</span>
 </p>
 <div className="text-[10px] text-[#8A8A85] mt-0.5 flex flex-wrap gap-1.5 items-center">
 <span className="text-[#1DB954] font-semibold flex items-center gap-1">
 <ShieldCheck className="w-3.5 h-3.5" /> ล็อกอินเข้าใช้งานได้ทันที
 </span>
 
 <span className="text-[#8A8A85]">|</span>
 <span className="bg-[#F0F0EB] text-[#6B6B66] px-1.5 py-0.5 rounded font-mono text-[9px]">
 สิทธิ์: {perms.length} รายการ
 </span>
 </div>
 </div>
 </div>

 <div className="flex items-center gap-1.5">
 <button
 type="button"
 onClick={() => {
 if (isEditing) {
 setEditingCaretakerId(null);
 } else {
 startEditingCaretaker(ct);
 }
 }}
 className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
 isEditing
 ? 'bg-[#F0F0EB] text-[#6B6B66] border-[#E0E0DB]'
 : 'bg-white hover:bg-[#E8E8E3] text-[#6B6B66] border-[#E0E0DB] '
 }`}
 >
 <SettingsIcon className="w-3.5 h-3.5" />
 <span>{isEditing ? 'ปิดการตั้งค่า' : 'ตั้งค่าสิทธิ์/รหัสผ่าน'}</span>
 </button>

 <button
 type="button"
 onClick={() => handleRemoveCaretaker(ct.id)}
 className="p-1.5 bg-white hover:bg-red-50 text-[#8A8A85] hover:text-red-600 rounded-lg border border-[#E0E0DB] transition cursor-pointer"
 title="ลบผู้ดูแล"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </div>

 {/* Editing panel */}
 {isEditing && (
 <div className="mt-2 pt-3.5 border-t border-[#E0E0DB] space-y-4">
 <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
 <label className="flex-1 text-[10px] font-bold text-[#6B6B66] uppercase tracking-wider">
 บทบาทพนักงาน
 <select value={editingRole} onChange={(e) => { const nextRole = e.target.value as UserRole; setEditingRole(nextRole); setEditingPermissions(permissionsForRole(nextRole)); }} className="mt-1.5 w-full bg-white border border-[#E0E0DB] rounded-xl px-3 py-2.5 text-xs">
 {(['caretaker', 'accountant', 'technician', 'housekeeper'] as UserRole[]).map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
 </select>
 </label>
 <button type="button" onClick={() => setEditingPermissions(permissionsForRole(editingRole))} className="px-3 py-2.5 rounded-xl border border-[#E0E0DB] bg-white text-xs font-bold">คืนค่าสิทธิ์ตามบทบาท</button>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {PERMISSION_CATALOG.map((permission) => (
 <label key={permission.key} className="flex gap-2 items-start rounded-lg border border-[#E0E0DB] bg-[#F0F0EB] p-2.5 cursor-pointer">
 <input type="checkbox" checked={editingPermissions.includes(permission.key)} onChange={(e) => setEditingPermissions((current) => e.target.checked ? [...new Set([...current, permission.key])] : current.filter((item) => item !== permission.key))} className="mt-0.5 rounded" />
 <span><span className="block text-xs font-bold text-[#1A1A1A]">{permission.label}</span><span className="block text-[9px] text-[#8A8A85]">{permission.group}</span></span>
 </label>
 ))}
 </div>
 {/* Permissions Selection */}
 <div className="hidden space-y-2">
 <p className="font-bold text-[#6B6B66] text-[11px] flex items-center gap-1">
 <ShieldCheck className="w-3.5 h-3.5 text-[#1DB954]" />
 <span>กำหนดสิทธิ์การเข้าใช้งานของผู้ดูแล:</span>
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
 <label className="flex items-start gap-2.5 cursor-pointer py-2 px-2.5 bg-[#F0F0EB] hover:bg-[#E8E8E3] rounded-xl border border-[#E0E0DB] transition">
 <input
 type="checkbox"
 checked={editingPermissions.includes('manage_rooms')}
 onChange={(e) => {
 if (e.target.checked) {
 setEditingPermissions([...editingPermissions, 'manage_rooms']);
 } else {
 setEditingPermissions(editingPermissions.filter(p => p !== 'manage_rooms'));
 }
 }}
 className="mt-0.5 rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <div>
 <p className="font-bold text-[#1A1A1A] text-[11px]">จัดการห้องพัก (Manage Rooms)</p>
 <p className="text-[9px] text-[#8A8A85] mt-0.5">อนุญาตให้เพิ่มห้อง, แก้ไขห้องพักและข้อมูลผู้เช่า</p>
 </div>
 </label>

 <label className="flex items-start gap-2.5 cursor-pointer py-2 px-2.5 bg-[#F0F0EB] hover:bg-[#E8E8E3] rounded-xl border border-[#E0E0DB] transition">
 <input
 type="checkbox"
 checked={editingPermissions.includes('manage_bills')}
 onChange={(e) => {
 if (e.target.checked) {
 setEditingPermissions([...editingPermissions, 'manage_bills']);
 } else {
 setEditingPermissions(editingPermissions.filter(p => p !== 'manage_bills'));
 }
 }}
 className="mt-0.5 rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <div>
 <p className="font-bold text-[#1A1A1A] text-[11px]">จัดการบิลค่าเช่า (Manage Bills)</p>
 <p className="text-[9px] text-[#8A8A85] mt-0.5">จดเลขมิเตอร์ไฟ-น้ำ คำนวณยอด สร้างบิล และลบบิล</p>
 </div>
 </label>

 <label className="flex items-start gap-2.5 cursor-pointer py-2 px-2.5 bg-[#F0F0EB] hover:bg-[#E8E8E3] rounded-xl border border-[#E0E0DB] transition">
 <input
 type="checkbox"
 checked={editingPermissions.includes('edit_payments')}
 onChange={(e) => {
 if (e.target.checked) {
 setEditingPermissions([...editingPermissions, 'edit_payments']);
 } else {
 setEditingPermissions(editingPermissions.filter(p => p !== 'edit_payments'));
 }
 }}
 className="mt-0.5 rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <div>
 <p className="font-bold text-[#1A1A1A] text-[11px]">บันทึกการชำระเงิน (Edit Payments)</p>
 <p className="text-[9px] text-[#8A8A85] mt-0.5">กดยืนยันการรับชำระเงิน ตรวจสอบสลิป และเปลี่ยนสถานะบิล</p>
 </div>
 </label>

 <label className="flex items-start gap-2.5 cursor-pointer py-2 px-2.5 bg-[#F0F0EB] hover:bg-[#E8E8E3] rounded-xl border border-[#E0E0DB] transition">
 <input
 type="checkbox"
 checked={editingPermissions.includes('manage_settings')}
 onChange={(e) => {
 if (e.target.checked) {
 setEditingPermissions([...editingPermissions, 'manage_settings']);
 } else {
 setEditingPermissions(editingPermissions.filter(p => p !== 'manage_settings'));
 }
 }}
 className="mt-0.5 rounded border-[#E0E0DB] text-[#1DB954] focus:ring-blue-500 w-3.5 h-3.5"
 />
 <div>
 <p className="font-bold text-[#1A1A1A] text-[11px]">ตั้งค่าระบบหลัก (Manage Settings)</p>
 <p className="text-[9px] text-[#8A8A85] mt-0.5">แก้ไขชื่อหอพัก อัตราหน่วยน้ำ-ไฟ เลขบัญชี และ LINE Bot</p>
 </div>
 </label>
 </div>
 </div>

 {/* Password Field */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <label className="block font-bold text-[#6B6B66] text-[11px] flex items-center gap-1">
 <Lock className="w-3.5 h-3.5 text-[#1DB954]" />
 <span>รหัสผ่านเข้าใช้งานผู้ดูแล (กรอกเมื่อต้องการตั้งรหัสผ่านใหม่):</span>
 </label>
 <input
 type="password"
 value={editingPassword}
 onChange={(e) => setEditingPassword(e.target.value)}
 placeholder="ระบุรหัสผ่านใหม่ (หากต้องการเปลี่ยน)"
 className="w-full bg-white border border-[#E0E0DB] rounded-lg px-3 py-1.5 text-xs text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition font-mono"
 />
 <p className="text-[9px] text-[#8A8A85]">
 💡 หากไม่ต้องการเปลี่ยนรหัสผ่าน ให้เว้นว่างไว้ค่ะ (ระบบจะคงรหัสผ่านเดิมไว้)
 </p>
 </div>
 </div>

 {/* Save & Cancel buttons */}
 <div className="flex justify-end gap-2 pt-2">
 <button
 type="button"
 onClick={() => setEditingCaretakerId(null)}
 className="px-3.5 py-2 bg-[#F0F0EB] hover:bg-slate-200 text-[#6B6B66] font-bold rounded-xl text-[11px] transition cursor-pointer"
 >
 ยกเลิก
 </button>
 <button
 type="button"
 disabled={savingCaretakerId === ct.id}
 onClick={() => handleSaveCaretaker(ct.id)}
 className="px-4.5 py-2 bg-[#1DB954] hover:bg-blue-500 text-white font-bold rounded-xl text-[11px] transition flex items-center gap-1 active:scale-[0.98] cursor-pointer"
 >
 {savingCaretakerId === ct.id ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าสิทธิ์'}
 </button>
 </div>
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 )}

 {canManageRecurringCharges && <RecurringChargesSettings idToken={idToken} />}

 <LicenseSettings idToken={idToken} enabled={isOwnerOrAdmin} showToast={showToast} />

 <WhiteLabelSettingsSection
  dormName={dormName}
  brandColor={brandColor}
  contactPhone={contactPhone}
  billFooter={billFooter}
  savedLogoDataUri={settings?.brandLogoUrl || null}
  pendingLogoDataUri={pendingLogoDataUri}
  whiteLabelEnabled={hasPlanFeature(subscriptionPlan, 'whiteLabel')}
  canEditWhiteLabel={canEditWhiteLabel && !logoMutationPending}
  lockReason={whiteLabelLockReason}
  onDormNameChange={setDormName}
  onBrandColorChange={setBrandColor}
  onContactPhoneChange={setContactPhone}
  onBillFooterChange={setBillFooter}
  onUploadLogo={handleUploadLogo}
  onDeleteLogo={handleDeleteLogo}
 />

 {brandingRefreshWarning && (
  <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs flex items-center gap-2.5">
   <AlertTriangle className="w-5 h-5 flex-shrink-0" />
   <p className="font-medium">{brandingRefreshWarning}</p>
  </div>
 )}

 {formSuccess && (
 <div className="p-4 bg-[#1DB954]/8 border border-[#1DB954]/30 text-[#1DB954] rounded-2xl text-xs flex items-center gap-2.5 animate-fadeIn">
 <CheckCircle className="w-5 h-5 text-[#1DB954] flex-shrink-0" />
 <div>
 <p className="font-bold">บันทึกการตั้งค่าระบบเสร็จสมบูรณ์!</p>
 <p className="text-[#8A8A85] mt-0.5">ข้อมูลระบบ อัตราคำนวณ และการตั้งค่า LINE บอท ได้รับการอัปเดตเรียบร้อยแล้วค่ะ</p>
 </div>
 </div>
 )}

 {formError && (
 <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs flex items-center gap-2.5 ">
 <AlertTriangle className="w-5 h-5 text-red-650 flex-shrink-0" />
 <p className="font-medium">{formError}</p>
 </div>
 )}

 <form onSubmit={handleSubmit} className="bg-white border border-[#E0E0DB] rounded-2xl p-6 space-y-6 text-xs text-[#6B6B66]">
 
 {isOwnerOrAdmin && (
 <div className="space-y-4">
 <h3 className="text-xs font-bold text-[#1A1A1A] border-b border-[#E0E0DB] pb-2 flex items-center gap-2">
 <Type className="w-4 h-4 text-[#1DB954]" />
 <span>ขนาดตัวอักษรของระบบ</span>
 </h3>
 <div className="rounded-xl border border-[#E0E0DB] bg-[#F0F0EB] p-4">
 <p className="mb-3 text-[11px] text-[#6B6B66]">การตั้งค่านี้มีผลกับผู้ใช้ทุกคนในหอพัก และปรับได้เฉพาะบัญชี Admin/เจ้าของหอพัก</p>
 <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
 <legend className="sr-only">เลือกขนาดตัวอักษร</legend>
 {([
 { value: 'small', label: 'เล็ก', detail: '90%' },
 { value: 'medium', label: 'มาตรฐาน', detail: '100%' },
 { value: 'large', label: 'ใหญ่', detail: '112.5%' },
 ] as const).map((option) => (
 <label key={option.value} className={`cursor-pointer rounded-xl border p-3 text-center transition ${fontScale === option.value ? 'border-[#1DB954] bg-white ring-2 ring-[#1DB954]/20' : 'border-[#E0E0DB] bg-white hover:border-[#1DB954]/60'}`}>
 <input type="radio" name="fontScale" value={option.value} checked={fontScale === option.value} onChange={() => selectFontScale(option.value)} className="sr-only" />
 <span className={`block font-bold text-[#1A1A1A] ${option.value === 'small' ? 'text-xs' : option.value === 'large' ? 'text-base' : 'text-sm'}`}>{option.label}</span>
 <span className="mt-1 block text-[10px] text-[#8A8A85]">{option.detail}</span>
 </label>
 ))}
 </fieldset>
 </div>
 </div>
 )}

 {/* Section 2: Unit rates and dates */}
 <div className="space-y-4">
 <h3 className="text-xs font-bold text-[#1A1A1A] border-b border-[#E0E0DB] pb-2 flex items-center gap-2">
 <Calendar className="w-4 h-4 text-[#1DB954]" />
 <span>อัตราค่าบริการและวันกำหนดชำระเงิน</span>
 </h3>

 <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">ค่าไฟต่อหน่วย (บาท) *</label>
 <div className="relative">
 <Zap className="absolute left-3.5 top-3.5 w-4 h-4 text-[#F59B23]" />
 <input
 type="number"
 step="any"
 value={defaultElecRate}
 onChange={(e) => setDefaultElecRate(e.target.value)}
 disabled={!canManageSettings}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 pl-10 text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 </div>
 </div>

 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">ค่าน้ำต่อหน่วย (บาท) *</label>
 <div className="relative">
 <Droplet className="absolute left-3.5 top-3.5 w-4 h-4 text-[#1DB954]" />
 <input
 type="number"
 step="any"
 value={defaultWaterRate}
 onChange={(e) => setDefaultWaterRate(e.target.value)}
 disabled={!canManageSettings}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 pl-10 text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 </div>
 </div>

 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">วันครบกำหนดชำระ (ของทุกเดือน) *</label>
 <div className="relative">
 <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-[#A855F7]" />
 <input
 type="number"
 min="1"
 max="31"
 placeholder="เช่น 5"
 value={defaultDueDateDay}
 onChange={(e) => setDefaultDueDateDay(e.target.value)}
 disabled={!canManageSettings}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 pl-10 text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 </div>
 </div>

 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">ค่าปรับล่าช้า (บาทต่อวัน) *</label>
 <div className="relative">
 <AlertTriangle className="absolute left-3.5 top-3.5 w-4 h-4 text-red-500" />
 <input
 type="number"
 min="0"
 placeholder="เช่น 100"
 value={defaultPenaltyRate}
 onChange={(e) => setDefaultPenaltyRate(e.target.value)}
 disabled={!canManageSettings}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 pl-10 text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 </div>
 </div>
 </div>
 </div>

 {/* Section 3: PromptPay info for QR */}
 <div className="space-y-4">
 <h3 className="text-xs font-bold text-[#1A1A1A] border-b border-[#E0E0DB] pb-2 flex items-center gap-2">
 <QrCode className="w-4 h-4 text-blue-600" />
 <span>ช่องทางชำระเงินผ่านพร้อมเพย์ (สแกน QR Code)</span>
 </h3>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">เบอร์พร้อมเพย์ หรือ เลขบัตรประชาชน</label>
 <input
 type="text"
 placeholder="เช่น 0891234567, 1100200345678"
 value={promptpayId}
 onChange={(e) => setPromptpayId(e.target.value)}
 disabled={!canUsePromptPay}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 text-[#1A1A1A] font-mono placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 <p className="text-[10px] text-[#8A8A85] mt-1 leading-relaxed">
 * ระบุเพื่อเปิดระบบสร้าง QR Code พร้อมเพย์รับเงินอัตโนมัติบนใบเสร็จบิล
 </p>
 </div>

 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">ชื่อ-นามสกุล เจ้าของบัญชีผู้รับเงิน</label>
 <div className="relative">
 <User className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8A8A85]" />
 <input
 type="text"
 placeholder="เช่น นายสมคิด มีทรัพย์"
 value={promptpayName}
 onChange={(e) => setPromptpayName(e.target.value)}
 disabled={!canUsePromptPay}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 pl-10 text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 </div>
 </div>
 </div>
 </div>

 {/* Section: Google Sheets Integration */}
 <div className="space-y-4">
 <h3 className="text-xs font-bold text-[#1A1A1A] border-b border-[#E0E0DB] pb-2 flex items-center gap-2">
 <FileSpreadsheet className="w-4 h-4 text-[#1DB954]" />
 <span>เชื่อมต่อ Google Sheets (ระบบบันทึกและรายงานข้อมูลออนไลน์)</span>
 </h3>

 <div className="p-4 bg-[#F0F0EB] rounded-xl border border-[#E0E0DB] space-y-4">
 <div>
 <p className="font-extrabold text-[#1A1A1A] text-[11px] uppercase flex items-center gap-1.5">
 <Sparkles className="w-3.5 h-3.5 text-[#F59B23]" />
 เชื่อมต่อ Google Spreadsheet
 {googleStatusLoading ? (
 <span className="ml-2 text-[#8A8A85] normal-case">กำลังตรวจสอบ…</span>
 ) : (
 <span className={`ml-2 rounded-full px-2 py-0.5 normal-case ${googleConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
 {googleConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
 </span>
 )}
 </p>
 <p className="text-[10px] text-[#8A8A85] mt-1 leading-relaxed">
 วาง Spreadsheet ID หรือ URL ของไฟล์ Google Sheets ที่ต้องการเชื่อมต่อกับระบบหอพัก แล้วกดปุ่ม "บันทึก ID" เพื่อบันทึกการตั้งค่า
 </p>
 </div>

 <div className="border-t border-[#E0E0DB] pt-4 space-y-4">
 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">
 Google Spreadsheet ID หรือ วาง URL ไฟล์ Google Sheets ที่นี่
 </label>
 <div className="flex flex-col sm:flex-row items-stretch gap-2">
 <input
 type="text"
 placeholder="วาง ID หรือวาง URL เช่น https://docs.google.com/spreadsheets/d/1A2b3C4d..."
 value={googleSpreadsheetId}
 onChange={(e) => setGoogleSpreadsheetId(extractSpreadsheetId(e.target.value))}
 disabled={!canUseGoogleSheets}
 className="flex-1 bg-white border border-[#E0E0DB] rounded-xl p-3 text-[#1A1A1A] font-mono text-[10px] focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />

 {canUseGoogleSheets && (
 <>
 <button
 type="button"
 onClick={() => handleSaveSpreadsheetIdOnly()}
 className="py-3 px-4 bg-[#1DB954] hover:bg-[#1ED760] hover:scale-[1.04] text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition "
 >
 <Save className="w-3.5 h-3.5" />
 <span>บันทึก ID</span>
 </button>
 {googleConnected ? (
 <button type="button" onClick={handleDisconnectGoogle} disabled={googleStatusLoading}
 className="py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition whitespace-nowrap disabled:opacity-50">
 <Trash2 className="w-3.5 h-3.5" /><span>ยกเลิกการเชื่อมต่อ</span>
 </button>
 ) : (
 <button type="button" onClick={handleConnectGoogle} disabled={googleStatusLoading}
 className="py-3 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition whitespace-nowrap disabled:opacity-50">
 <Link2 className="w-3.5 h-3.5" /><span>เชื่อมต่อ Google OAuth</span>
 </button>
 )}
 </>
 )}
 </div>
 <p className="text-[10px] text-[#8A8A85] mt-1.5 leading-relaxed">
 * วาง <b>Spreadsheet ID</b> ในช่องด้านบนแล้วกด <b className="text-[#1DB954]">"บันทึก ID"</b> และต้องกด <b className="text-blue-600">"เชื่อมต่อ Google OAuth"</b> เพื่ออนุญาตสิทธิ์ก่อนส่งออกข้อมูล
 </p>
 </div>

 {extractSpreadsheetId(googleSpreadsheetId) && (
 <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-[#E0E0DB] text-[10px] text-[#6B6B66]">
 <FileSpreadsheet className="w-4 h-4 text-[#1DB954] flex-shrink-0" />
 <span className="flex-1 overflow-hidden overflow-ellipsis whitespace-nowrap">
 <b>ไฟล์ของคุณพร้อมใช้งาน:</b> https://docs.google.com/spreadsheets/d/{extractSpreadsheetId(googleSpreadsheetId)}/edit
 </span>
 <a
 href={`https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(googleSpreadsheetId)}/edit`}
 target="_blank"
 rel="noopener noreferrer"
 referrerPolicy="no-referrer"
 className="text-[#1DB954] hover:text-emerald-700 font-bold flex items-center gap-1 cursor-pointer ml-2"
 >
 <span>เปิดชีต</span>
 <ExternalLink className="w-3 h-3" />
 </a>
 </div>
 )}

 {sheetSuccessMessage && (
 <div className="p-3 bg-[#1DB954]/8 border border-[#1DB954]/30 rounded-xl text-[#1DB954] text-[10px] font-semibold flex items-center gap-2">
 <CheckCircle className="w-4 h-4 text-[#1DB954]" />
 <span>{sheetSuccessMessage}</span>
 </div>
 )}

 {sheetErrorMessage && (
 <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-[10px] font-semibold flex items-center gap-2">
 <AlertTriangle className="w-4 h-4 text-red-600" />
 <span>{sheetErrorMessage}</span>
 </div>
 )}
 </div>
 </div>
 </div>

 <BackupRestoreSettings
 idToken={idToken}
 subscriptionPlan={subscriptionPlan}
 role={role}
 showToast={showToast}
 onRestoreSuccess={onRestoreSuccess}
 />

 {/* Section: Data Export for reporting */}
 {canExportData && (
 <div className="space-y-4 pt-4 border-t border-[#E0E0DB]">
 <h3 className="text-xs font-bold text-[#1A1A1A] border-b border-[#E0E0DB] pb-2 flex items-center gap-2">
 <Download className="w-4 h-4 text-[#1DB954]" />
 <span>ส่งออกเพื่อรายงาน (CSV Export)</span>
 </h3>

 <div className="p-4.5 bg-[#1DB954]/10 border border-[#1DB954]/30 rounded-2xl space-y-3">
 <div>
 <p className="font-extrabold text-[#1A1A1A] text-xs flex items-center gap-1.5">
 <FileSpreadsheet className="w-4 h-4 text-[#1DB954]" />
 <span>ดาวน์โหลดข้อมูลระบบเก็บไว้ในคอมพิวเตอร์</span>
 </p>
 <p className="text-[11px] text-[#6B6B66] mt-1 leading-relaxed">
 ส่งออกห้องพัก บิล ประวัติแจ้งซ่อม สัญญาเช่า ประกาศ และโน้ตเป็น ZIP ของไฟล์ CSV สำหรับรายงานและตรวจสอบข้อมูลเท่านั้น ไม่ใช่ไฟล์สำหรับ Restore
 </p>
 </div>

 <div className="flex flex-wrap items-center gap-3 pt-2">
 <button
 type="button"
 onClick={handleExportAllCSV}
 disabled={isExportingAll}
 className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-[#1A1A1A] font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
 >
 {isExportingAll ? (
 <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
 ) : (
 <Download className="w-4 h-4" />
 )}
 <span>ดาวน์โหลด ZIP ของไฟล์ CSV</span>
 </button>

 </div>
 </div>
 </div>
 )}

 {/* Section 4: LINE Developers Messaging API Settings */}
 <div className="space-y-4">
 <h3 className="text-xs font-bold text-[#1A1A1A] border-b border-[#E0E0DB] pb-2 flex items-center gap-2">
 <MessageSquare className="w-4 h-4 text-green-600 fill-green-50" />
 <span>เชื่อมต่อ LINE Messaging API (แจ้งบิลอัตโนมัติ)</span>
 </h3>

 {/* Webhook copying panel */}
 <div className="p-4 bg-[#F0F0EB] rounded-xl border border-[#E0E0DB] space-y-2">
 <p className="font-extrabold text-[#1A1A1A]">🔗 ที่อยู่สำหรับ Webhook (LINE Developer Webhook URL)</p>
 <p className="text-[10px] text-[#8A8A85]">คัดลอกลิงก์ด้านล่างไปใส่ในช่อง Webhook URL ในหน้า LINE Developers Console เพื่อรับข้อความตอบกลับอัตโนมัติ:</p>
 <div className="flex items-center gap-2">
 <input
 type="text"
 readOnly
 value={webhookUrl}
 className="flex-1 bg-white border border-[#E0E0DB] text-[#6B6B66] font-mono text-[10px] p-2.5 rounded-lg focus:outline-none select-all"
 />
 <button
 type="button"
 onClick={handleCopyWebhook}
 className="p-2.5 bg-white hover:bg-[#E8E8E3] border border-[#E0E0DB] text-[#6B6B66] rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer"
 >
 <Copy className="w-3.5 h-3.5" />
 <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}</span>
 </button>
 </div>
 </div>

 {/* Line bot credential settings */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label htmlFor="line-access-token" className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">LINE Channel Access Token</label>
 {lineTokenConfigured && !removeLineToken && <p className="mb-1 text-[10px] font-semibold text-emerald-700">ตั้งค่าแล้ว — เว้นว่างไว้เพื่อใช้ค่าเดิม</p>}
 <input
 id="line-access-token"
 type="password"
 autoComplete="new-password"
 placeholder={lineTokenConfigured && !removeLineToken ? 'กรอกเฉพาะเมื่อต้องการเปลี่ยน Token' : 'eyJhbGciOiJIUzI1Ni...'}
 value={lineChannelAccessToken}
 onChange={(e) => { setLineChannelAccessToken(e.target.value); setRemoveLineToken(false); }}
 disabled={!canUseLineIntegration || removeLineToken}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 font-mono text-[10px] text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 <p className="text-[9px] text-[#8A8A85] mt-1 leading-relaxed">
 * ใช้สำหรับส่งบิลเข้าแชท ระบบจะไม่แสดง Token เดิมกลับมาบนหน้าจอ
 </p>
 {canUseLineIntegration && lineTokenConfigured && (
 <button type="button" onClick={() => { setRemoveLineToken(!removeLineToken); setLineChannelAccessToken(''); }} className="mt-1 text-[10px] font-bold text-red-700 underline">
 {removeLineToken ? 'ยกเลิกการลบ Token' : 'ลบ Token ที่บันทึกไว้'}
 </button>
 )}
 </div>

 <div>
 <label htmlFor="line-channel-secret" className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">LINE Channel Secret</label>
 {lineSecretConfigured && !removeLineSecret && <p className="mb-1 text-[10px] font-semibold text-emerald-700">ตั้งค่าแล้ว — เว้นว่างไว้เพื่อใช้ค่าเดิม</p>}
 <input
 id="line-channel-secret"
 type="password"
 autoComplete="new-password"
 placeholder={lineSecretConfigured && !removeLineSecret ? 'กรอกเฉพาะเมื่อต้องการเปลี่ยน Secret' : '4a6f9b8c...'}
 value={lineChannelSecret}
 onChange={(e) => { setLineChannelSecret(e.target.value); setRemoveLineSecret(false); }}
 disabled={!canUseLineIntegration || removeLineSecret}
 className="w-full bg-white border border-[#E0E0DB] rounded-xl p-3 font-mono text-[10px] text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-[#1DB954] transition disabled:opacity-50"
 />
 {canUseLineIntegration && lineSecretConfigured && (
 <button type="button" onClick={() => { setRemoveLineSecret(!removeLineSecret); setLineChannelSecret(''); }} className="mt-1 text-[10px] font-bold text-red-700 underline">
 {removeLineSecret ? 'ยกเลิกการลบ Secret' : 'ลบ Secret ที่บันทึกไว้'}
 </button>
 )}
 </div>
 </div>

 {/* Enable switcher */}
 <div className="flex items-center justify-between p-3.5 bg-[#F0F0EB] rounded-xl border border-[#E0E0DB]">
 <div>
 <p className="font-extrabold text-[#1A1A1A] text-xs uppercase">เปิดใช้งานระบบตอบกลับ LINE อัตโนมัติ (Auto-responder Bot)</p>
 <p className="text-[10px] text-[#8A8A85] mt-0.5">เปิดระบบผู้ใช้พิมพ์ "บิล" หรือ "ยอดค้าง" เพื่อดึงข้อมูลอัตโนมัติ</p>
 </div>
 <button
 type="button"
 role="switch"
 aria-checked={lineBotEnabled}
 aria-label="เปิดหรือปิดระบบตอบกลับ LINE อัตโนมัติ"
 disabled={!canUseLineIntegration}
 onClick={() => setLineBotEnabled(!lineBotEnabled)}
 className="text-[#8A8A85] hover:text-slate-600 transition focus:outline-none cursor-pointer disabled:opacity-50"
 >
 {lineBotEnabled ? (
 <ToggleRight className="w-9 h-9 text-green-600" />
 ) : (
 <ToggleLeft className="w-9 h-9 text-[#8A8A85]" />
 )}
 </button>
 </div>

  {canUseLineIntegration && (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-[#1A1A1A] font-bold rounded-xl text-[11px] flex items-center gap-1.5 cursor-pointer transition active:scale-[0.98]"
      >
        <Save className="w-3.5 h-3.5" />
        <span>{submitting ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า LINE'}</span>
      </button>
    </div>
  )}
  </div>

 {/* Section 5: Real-time Live Webhook Logs */}
 <div className="space-y-3 pt-2">
 <div className="flex items-center justify-between border-b border-[#E0E0DB] pb-2">
 <h3 className="text-xs font-bold text-[#1A1A1A] flex items-center gap-2">
 <Terminal className="w-4 h-4 text-[#F59B23]" />
 <span>บันทึกประวัติการส่งสัญญาณ LINE (Live Webhook Events)</span>
 </h3>
 <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#6B6B66] animate-pulse bg-white px-2 py-0.5 rounded-full border border-[#E0E0DB]">
 <RefreshCw className="w-3 h-3 text-[#1DB954] animate-spin" />
 <span>LIVE FEED</span>
 </span>
 </div>

 {safeLineLogs.length === 0 ? (
 <div className="bg-[#F0F0EB] rounded-xl p-6 text-center border border-[#E0E0DB] text-[#8A8A85]">
 <p className="text-[11px] font-semibold">ยังไม่มีกิจกรรมบน LINE ในเซสชันนี้</p>
 <p className="text-[9px] text-[#8A8A85] mt-0.5">
 ประวัติการเชื่อมโยงคู่สาย บันทึกข้อความแชท และส่งบิลจะแจ้งขึ้นแบบ Real-time ด้านล่างนี้เมื่อผู้ใช้แชทเข้ามา
 </p>
 </div>
 ) : (
 <div className="bg-slate-950 rounded-xl border border-slate-800 max-h-48 overflow-y-auto divide-y divide-slate-900 font-mono text-[10px] text-slate-200">
 {safeLineLogs.map((log) => (
 <div key={log.id} className="p-2.5 flex items-start gap-2 leading-relaxed">
 <span className="text-[#8A8A85] flex-shrink-0">[{log.timestamp.substring(11, 19)}]</span>
 
 {log.type === 'incoming' && (
 <span className="text-[#1DB954] font-bold flex-shrink-0">📥 INBOUND:</span>
 )}
 {log.type === 'outgoing' && (
 <span className="text-green-400 font-bold flex-shrink-0">📤 OUTBOUND:</span>
 )}
 {log.type === 'system' && (
 <span className="text-purple-400 font-bold flex-shrink-0">⚙️ SYSTEM:</span>
 )}

 <span className="text-[#8A8A85] flex-1">{log.message}</span>
 {log.roomNumber && (
 <span className="text-[#8A8A85] font-bold bg-slate-900 px-1.5 py-0.5 rounded-md border border-[#E0E0DB]">ห้อง {log.roomNumber}</span>
 )}
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Submit */}
 {canManageSettings && (
 <div className="pt-4 border-t border-[#E0E0DB] flex items-center justify-end">
 <button
 type="submit"
 disabled={submitting}
 className="py-3 px-6 rounded-xl bg-[#1DB954] hover:bg-[#1ED760] hover:scale-[1.04] text-white font-bold transition flex items-center gap-2 active:scale-[0.98] cursor-pointer"
 >
 <Save className="w-4.5 h-4.5" />
 <span>{submitting ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าระบบ'}</span>
 </button>
 </div>
 )}

 </form>



 {/* Section: Change Password */}
 <div className="bg-white border border-[#E0E0DB] rounded-2xl p-6 space-y-4 text-xs text-[#6B6B66]">
 <div>
 <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
 <Lock className="w-4.5 h-4.5 text-[#F59B23]" />
 <span>เปลี่ยนรหัสผ่านเข้าสู่ระบบ (Change Password)</span>
 </h3>
 <p className="text-[11px] text-[#8A8A85] mt-0.5">
 แก้ไขรหัสผ่านสำหรับการเข้าสู่ระบบในเครื่องนี้ (ใช้สิทธิ์ของตนเอง หรือ บัญชี admin ของเจ้าของหอพัก)
 </p>
 </div>

 {pwSuccess && (
 <div className="p-3.5 bg-[#1DB954]/8 border border-[#1DB954]/30 text-emerald-850 rounded-xl text-[11px] font-medium flex items-center gap-2">
 <CheckCircle className="w-4.5 h-4.5 text-[#1DB954] flex-shrink-0" />
 <span>{pwSuccess}</span>
 </div>
 )}

 {pwError && (
 <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium flex items-center gap-2">
 <AlertTriangle className="w-4.5 h-4.5 text-red-600 flex-shrink-0" />
 <span>{pwError}</span>
 </div>
 )}

 <form onSubmit={handlePasswordChange} className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">รหัสผ่านเดิม *</label>
 <input
 type="password"
 placeholder="ระบุรหัสผ่านเดิม"
 value={currentPassword}
 onChange={(e) => setCurrentPassword(e.target.value)}
 required
 className="w-full bg-white border border-[#E0E0DB] rounded-xl px-4 py-3 text-xs text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-amber-500 transition"
 />
 </div>

 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-xs">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว พร้อมพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ) *</label>
 <input
 type="password"
 placeholder="ระบุรหัสผ่านใหม่"
 value={newPassword}
 onChange={(e) => setNewPassword(e.target.value)}
 required
 className="w-full bg-white border border-[#E0E0DB] rounded-xl px-4 py-3 text-xs text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-amber-500 transition"
 />
 </div>

 <div>
 <label className="block text-[#8A8A85] font-bold mb-1.5 uppercase tracking-wider text-[10px]">ยืนยันรหัสผ่านใหม่ *</label>
 <input
 type="password"
 placeholder="ยืนยันรหัสผ่านใหม่"
 value={confirmPassword}
 onChange={(e) => setConfirmPassword(e.target.value)}
 required
 className="w-full bg-white border border-[#E0E0DB] rounded-xl px-4 py-3 text-xs text-[#1A1A1A] placeholder-slate-400 focus:outline-none focus:border-amber-500 transition"
 />
 </div>
 </div>

 <div className="flex justify-end pt-2">
 <button
 type="submit"
 disabled={pwSubmitting}
 className="px-5 py-3 bg-amber-600 hover:bg-amber-500 text-[#1A1A1A] font-bold rounded-xl text-xs flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer shrink-0 "
 >
 <KeyRound className="w-4 h-4" />
 <span>{pwSubmitting ? 'กำลังเปลี่ยนรหัสผ่าน...' : 'เปลี่ยนรหัสผ่านใหม่'}</span>
 </button>
 </div>
 </form>
 </div>

 </div>
 );
};
