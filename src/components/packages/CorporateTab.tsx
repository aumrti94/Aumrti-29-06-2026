import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Upload, Users, Loader2, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useHospitalId } from '@/hooks/useHospitalId';
import { generateBillNumber } from "@/hooks/useBillNumber";
import { autoPostJournalEntry } from "@/lib/accounting";
import { recalculateBillTotalsSafe } from "@/lib/billTotals";
import { roundCurrency, calcLineTotal } from "@/lib/currency";
import { getDefaultGSTRate } from "@/lib/gstRules";
import { parseComponents, componentsOfType } from "@/lib/packageComponents";
import { resolveComponentNames, STAGED_ORDERS_KEY, releasePackageOrders } from "@/lib/packageOrders";


interface CsvEmployee {
  name: string; phone: string; dob: string; gender: string; employee_id: string;
  _error?: string;
}

export default function CorporateTab() {
  const { hospitalId } = useHospitalId();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkAccountId, setBulkAccountId] = useState("");
  const [bulkPackageId, setBulkPackageId] = useState("");
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split("T")[0]);
  const [csvEmployees, setCsvEmployees] = useState<CsvEmployee[]>([]);
  const [booking, setBooking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ company_name: "", contact_person: "", contact_phone: "", contact_email: "", gstin: "", credit_days: 30, negotiated_rate_percent: 0 });

  const load = useCallback(async () => {
    const { data } = await supabase.from("corporate_accounts").select("*").eq("hospital_id", hospitalId).eq("is_active", true).order("company_name");
    setAccounts(data || []);
  }, [hospitalId]);

  const loadPackages = useCallback(async () => {
    // `components` is read here (not just id/package_name/price) so bulkBook can stage the
    // package's lab/radiology orders without a second round trip per employee.
    const { data } = await supabase.from("health_packages").select("id, package_name, price, components").eq("hospital_id", hospitalId).eq("is_active", true).order("package_name");
    setPackages(data || []);
  }, [hospitalId]);

  useEffect(() => { load(); loadPackages(); }, [load, loadPackages]);


  const save = async () => {
    if (!form.company_name.trim()) { toast.error("Company name required"); return; }
    const { error } = await supabase.from("corporate_accounts").insert({
      hospital_id: hospitalId, ...form,
    });
    if (error) { console.error("Corporate account insert error:", error); toast.error(error.message || "Failed to add account"); return; }
    toast.success("Corporate account added");
    setShowAdd(false);
    setForm({ company_name: "", contact_person: "", contact_phone: "", contact_email: "", gstin: "", credit_days: 30, negotiated_rate_percent: 0 });
    load();
  };

  const parseRows = (rows: Record<string, string>[]) => {
    const employees: CsvEmployee[] = rows.map(row => {
      const lc = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), String(v || "").trim()]));
      const name = lc.name || lc.full_name || lc.employee_name || "";
      const phone = lc.phone || lc.mobile || lc.contact || "";
      const dob = lc.dob || lc.date_of_birth || lc.birth_date || "";
      const gender = lc.gender || "other";
      const employee_id = lc.employee_id || lc.emp_id || lc.id || "";
      const error = !name ? "Name is required" : (!phone && !employee_id) ? "Phone or Employee ID needed" : undefined;
      return { name, phone, dob, gender, employee_id, _error: error };
    }).filter(e => e.name || e.phone);
    setCsvEmployees(employees);
    const errorCount = employees.filter(e => e._error).length;
    if (errorCount > 0) toast.error(`${errorCount} row(s) have validation errors — review before submitting`);
    else toast.success(`Parsed ${employees.length} employees`);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (isXlsx) {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        parseRows(rows);
      } else {
        const text = ev.target?.result as string;
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length < 2) { toast.error("File must have header + at least 1 row"); return; }
        const header = lines[0].split(",").map(h => h.trim());
        const rows = lines.slice(1).map(line => {
          const cols = line.split(",").map(c => c.trim());
          return Object.fromEntries(header.map((h, i) => [h, cols[i] || ""]));
        });
        parseRows(rows);
      }
    };
    if (isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["employee_id", "name", "phone", "dob", "gender", "email", "package_code", "visit_date"],
      ["EMP001", "John Doe", "9876543210", "1990-01-15", "male", "john@corp.com", "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "corporate_bulk_booking_template.xlsx");
  };

  const bulkBook = async () => {
    if (!hospitalId) { toast.error("Hospital not resolved — reload and try again"); return; }
    if (!bulkAccountId) { toast.error("Select a corporate account"); return; }
    if (!bulkPackageId) { toast.error("Select a package"); return; }
    if (csvEmployees.length === 0) { toast.error("Upload file first"); return; }
    const validEmployees = csvEmployees.filter(e => !e._error);
    if (validEmployees.length === 0) { toast.error("No valid employees to book"); return; }

    const selectedAccount = accounts.find(a => a.id === bulkAccountId);
    const selectedPkg = packages.find(p => p.id === bulkPackageId);
    if (!selectedAccount || !selectedPkg) { toast.error("Account or package not found — reopen the dialog"); return; }

    setBooking(true);
    let success = 0;
    let failed = 0;
    let stagingIncomplete = 0;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: userData } = await supabase.from("users").select("id").eq("auth_user_id", user?.id || "").maybeSingle();
    const userId = userData?.id || null;

    // Corporate account's negotiated rate — captured on the Add Corporate Account form but,
    // until now, never read by any billing path. Apply it here so the company is billed at
    // its contracted rate, not full list price.
    const discountPercent = Number(selectedAccount.negotiated_rate_percent) || 0;
    const listPrice = Number(selectedPkg.price) || 0;
    const fee = roundCurrency(listPrice * (1 - discountPercent / 100));
    // Health packages are a composite healthcare supply — statutory rate from gstRules
    // (gst_master-equivalent for this item type), never a hardcoded literal.
    const gstPercent = getDefaultGSTRate("package");
    const { gst: gstAmount, total } = calcLineTotal(fee, gstPercent);
    const today = new Date().toISOString().split("T")[0];
    const creditDays = selectedAccount.credit_days ?? 30;

    // Resolve the package's lab/radiology components ONCE for the whole batch — every employee
    // in this CSV is booking the same package, so the master lookup (resolveComponentNames) is
    // package-level, not per-employee. Identical resolution to BookPackageModal.tsx's booking-time
    // staging; only the per-employee syncLabOrders/syncRadiologyOrders calls below vary by patient.
    const components = parseComponents(selectedPkg.components);
    const labNames = await resolveComponentNames(
      hospitalId, componentsOfType(components, "lab_test"), "lab_test_master", "test_name");
    const radNames = await resolveComponentNames(
      hospitalId, componentsOfType(components, "radiology"), "radiology_study_master", "study_name");

    for (const emp of validEmployees) {
      try {
        // Find or create patient by phone
        let patientId: string | null = null;
        if (emp.phone) {
          const { data: existing } = await supabase
            .from("patients")
            .select("id")
            .eq("hospital_id", hospitalId)
            .eq("phone", emp.phone)
            .limit(1)
            .maybeSingle();

          if (existing) {
            patientId = existing.id;
          }
        }

        if (!patientId && emp.name) {
          const { data: newPatient, error: pErr } = await supabase
            .from("patients")
            .insert({
              hospital_id: hospitalId,
              full_name: emp.name,
              phone: emp.phone || null,
              dob: emp.dob || null,
              gender: (emp.gender || "other") as any,
              uhid: `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            } as any)
            .select("id")
            .maybeSingle();

          if (pErr || !newPatient) { failed++; continue; }
          patientId = newPatient.id;
        }

        if (!patientId) { failed++; continue; }

        // Create the deferred/credit bill FIRST, before the booking exists at all — this is
        // the fix for the leak this function used to be: a package_bookings row was inserted
        // with no bills row behind it, so Today's Checkups could raise real lab/radiology
        // orders (via the Lab station's pre-staging fallback) with nothing ever billed.
        // Corporate accounts are invoiced on credit terms (credit_days), not paid at booking
        // time, so the bill is created unpaid/outstanding now rather than withheld like an
        // individual walk-in package.
        const billNumber = await generateBillNumber(hospitalId, "PKG");
        const { data: bill, error: billErr } = await supabase.from("bills").insert({
          hospital_id: hospitalId,
          patient_id: patientId,
          bill_number: billNumber,
          bill_type: "package" as any,
          bill_date: today,
          subtotal: fee,
          gst_amount: gstAmount,
          total_amount: total,
          patient_payable: total,
          paid_amount: 0,
          balance_due: total,
          payment_status: "unpaid",
          bill_status: "final",
          gstin_patient: selectedAccount.gstin || null,
          notes: `Corporate billing — ${selectedAccount.company_name} — due in ${creditDays} day(s) on credit terms. Employee: ${emp.name}${emp.employee_id ? ` (ID ${emp.employee_id})` : ""}.`,
          created_by: userId,
        } as any).select("id").maybeSingle();

        if (billErr || !bill) { console.error("Corporate package bill failed:", billErr); failed++; continue; }

        const { error: liErr } = await supabase.from("bill_line_items").insert({
          hospital_id: hospitalId,
          bill_id: bill.id,
          description: `Health Package (Corporate — ${selectedAccount.company_name}): ${selectedPkg.package_name}`,
          item_type: "package",
          unit_rate: fee,
          quantity: 1,
          taxable_amount: fee,
          gst_percent: gstPercent,
          gst_amount: gstAmount,
          total_amount: total,
        } as any);
        if (liErr) { console.error("Corporate package line item failed:", liErr); failed++; continue; }

        await recalculateBillTotalsSafe(bill.id);

        await autoPostJournalEntry({
          triggerEvent: "bill_finalized_opd",
          sourceModule: "packages",
          sourceId: bill.id,
          amount: total,
          description: `Corporate Package Revenue - ${selectedAccount.company_name} - ${selectedPkg.package_name} - ${billNumber}`,
          hospitalId,
          postedBy: userId || "",
        });

        // Stage this employee's lab/radiology orders BEFORE the package_bookings insert, same
        // as BookPackageModal.tsx. syncLabOrders/syncRadiologyOrders write billing_status:
        // "unbilled" — they only become visible to the Lab/Radiology worklists once released
        // below (or, for a non-corporate booking, on payment — see billPayments.ts). Each call
        // is independently try/caught, matching BookPackageModal: a sync failure for one
        // employee must not fail the booking for that employee, nor abort the batch.
        const stagedLabIds: string[] = [];
        const stagedRadIds: string[] = [];
        const indication = `Health Package (Corporate — ${selectedAccount.company_name}): ${selectedPkg.package_name}`;
        // Tracks whether any part of this employee's lab/radiology staging failed to fully
        // land — a sync throwing, or a sync returning unmatched tests/studies. This is an
        // audit-trail gap, not a billing error: the bill above is already correct regardless,
        // but an operator needs to know this employee's bill may have fewer orders behind it
        // than the package promises.
        let empStagingIncomplete = false;

        if (labNames.length > 0) {
          try {
            const { syncLabOrders } = await import("@/lib/investigationSync");
            const labSync = await syncLabOrders({
              hospitalId, patientId, orderedBy: userId || "",
              encounterId: null, admissionId: null,
              items: labNames.map(t => ({ test_name: t, urgency: "routine", clinical_indication: indication })),
            });
            stagedLabIds.push(...labSync.orderIds);
            if (labSync.unmatched.length > 0) {
              console.error(`Corporate package lab test(s) not in test master for ${emp.name}: ${labSync.unmatched.join(", ")}`);
              empStagingIncomplete = true;
            }
          } catch (e) {
            console.error("Corporate package lab order sync error:", e);
            empStagingIncomplete = true;
          }
        }

        if (radNames.length > 0) {
          try {
            const { syncRadiologyOrders } = await import("@/lib/investigationSync");
            const radSync = await syncRadiologyOrders({
              hospitalId, patientId, orderedBy: userId || "",
              encounterId: null, admissionId: null,
              items: radNames.map(r => ({ study_name: r, urgency: "routine", clinical_indication: indication })),
            });
            stagedRadIds.push(...radSync.orderIds);
            if (radSync.unmatched.length > 0) {
              console.error(`Corporate package radiology study(ies) not in study master for ${emp.name}: ${radSync.unmatched.join(", ")}`);
              empStagingIncomplete = true;
            }
          } catch (e) {
            console.error("Corporate package radiology order sync error:", e);
            empStagingIncomplete = true;
          }
        }

        // Create booking with the bill already linked, hospital_id set, and the staged order
        // ids recorded under the reserved components_done key — identical shape to
        // BookPackageModal.tsx so TodaysCheckupsTab's readStagedOrders()/alreadyStaged check
        // recognises these exactly as it would a modal-booked package.
        //
        // Previously this insert (a) never set hospital_id — a NOT NULL column with no
        // default and no trigger on package_bookings, so every row failed outright — and
        // (b) sent `booking_source: "corporate"`, a column that does not exist on
        // package_bookings in the generated schema or any migration that created/altered the
        // table. Net effect in production: a 100% insert failure rate, so no corporate bulk
        // booking has ever actually been created. `corporate_account_id` already identifies a
        // corporate-sourced booking, so the invalid booking_source field is dropped rather
        // than replaced.
        const { error: bErr } = await supabase.from("package_bookings").insert({
          hospital_id: hospitalId,
          patient_id: patientId,
          package_id: bulkPackageId,
          scheduled_date: bulkDate,
          status: "booked",
          corporate_account_id: bulkAccountId,
          bill_id: bill.id,
          components_done: {
            [STAGED_ORDERS_KEY]: { lab: stagedLabIds, radiology: stagedRadIds },
          },
        } as any);

        if (bErr) { console.error("Corporate booking insert failed:", bErr); failed++; continue; }

        // Corporate accounts are billed on credit (credit_days, applied to this bill's notes
        // above) — the employee's bill may legitimately sit unpaid for the whole credit window.
        // billPayments.ts only calls releasePackageOrders() when a bill is PAID, which would
        // leave these lab/radiology orders invisible to their worklists for that entire window.
        // For a corporate account, "bill exists under the credit contract" — already true at
        // this point — is the correct trust boundary, not "bill paid", so release immediately
        // rather than waiting for a payment event that may be weeks away.
        await releasePackageOrders(bill.id);

        if (empStagingIncomplete) stagingIncomplete++;
        success++;
      } catch (e) {
        console.error("Corporate bulk booking error:", e);
        failed++;
      }
    }

    setBooking(false);
    // `failed` is "the booking/bill itself failed" (no bill exists for this employee).
    // `stagingIncomplete` is a distinct, narrower condition: the booking and bill succeeded,
    // but the lab/radiology orders behind it did not fully stage (sync threw, or came back
    // with unmatched tests/studies) — a valid corporate bill with missing orders behind it
    // that needs a manual follow-up, not a billing-correctness problem.
    toast.success(
      `Booked and billed ${success} employees.` +
      `${failed > 0 ? ` ${failed} failed.` : ""}` +
      `${stagingIncomplete > 0 ? ` Lab/radiology orders could not be created for ${stagingIncomplete} — check manually.` : ""}`
    );
    setCsvEmployees([]);
    setShowBulk(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Corporate Accounts</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowBulk(true)}><Upload className="h-4 w-4 mr-1" /> Bulk Book from File</Button>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add Corporate Account</Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Credit Days</TableHead>
              <TableHead>Discount %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.company_name}</TableCell>
                <TableCell>{a.contact_person || "—"}</TableCell>
                <TableCell>{a.contact_phone || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{a.gstin || "—"}</TableCell>
                <TableCell>{a.credit_days}</TableCell>
                <TableCell>{a.negotiated_rate_percent}%</TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No corporate accounts</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Account Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Corporate Account</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
            <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
            <div><Label>Credit Days</Label><Input type="number" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: +e.target.value })} /></div>
            <div><Label>Discount %</Label><Input type="number" value={form.negotiated_rate_percent} onChange={(e) => setForm({ ...form, negotiated_rate_percent: +e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Booking Dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle><Users className="h-5 w-5 inline mr-2" />Corporate Bulk Booking</DialogTitle></DialogHeader>
          
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Corporate Account *</Label>
              <Select value={bulkAccountId} onValueChange={setBulkAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Package *</Label>
              <Select value={bulkPackageId} onValueChange={setBulkPackageId}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>
                  {packages.map(p => <SelectItem key={p.id} value={p.id}>{p.package_name} — ₹{p.price}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scheduled Date *</Label>
              <Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
            </div>
          </div>

          <div className="border-2 border-dashed rounded-lg p-4 text-center space-y-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCsvUpload} />
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Upload Employee File
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" /> Download Template
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Accepts .xlsx, .xls, or .csv — columns: employee_id, name, phone, dob, gender</p>
          </div>

          {csvEmployees.length > 0 && (
            <div className="max-h-48 overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Emp ID</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvEmployees.map((emp, i) => (
                    <TableRow key={i} className={emp._error ? "bg-red-50" : ""}>
                      <TableCell>{emp.name}</TableCell>
                      <TableCell>{emp.phone}</TableCell>
                      <TableCell>{emp.dob}</TableCell>
                      <TableCell>{emp.gender}</TableCell>
                      <TableCell>{emp.employee_id}</TableCell>
                      <TableCell>{emp._error ? <span className="text-xs text-red-600">{emp._error}</span> : <span className="text-xs text-emerald-600">✓ OK</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {csvEmployees.length > 0 && (
            <Badge variant={csvEmployees.some(e => e._error) ? "destructive" : "secondary"} className="text-sm">
              {csvEmployees.filter(e => !e._error).length}/{csvEmployees.length} valid employees ready to book
            </Badge>
          )}

          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => { setShowBulk(false); setCsvEmployees([]); }}>Cancel</Button>
            <Button onClick={bulkBook} disabled={booking || csvEmployees.length === 0}>
              {booking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Book for {csvEmployees.length} Employees
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
