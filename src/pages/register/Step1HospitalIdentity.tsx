import React from "react";
import { RegistrationData, INDIAN_STATES, BED_COUNTS } from "./constants";
import { BROAD_CATEGORIES, getHospitalTypesByCategory, getHospitalTypeByKey } from "@/lib/hospitalTypes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import PhoneOtpVerify from "./PhoneOtpVerify";

interface Props {
  data: RegistrationData;
  onChange: (d: Partial<RegistrationData>) => void;
  /** Whether the platform requires OTP phone verification at signup */
  otpRequired: boolean;
}

const Step1HospitalIdentity: React.FC<Props> = ({ data, onChange, otpRequired }) => {
  const typesInCategory = data.hospitalBroadCategory
    ? getHospitalTypesByCategory(data.hospitalBroadCategory)
    : [];
  const selectedType = getHospitalTypeByKey(data.hospitalType);

  const toggleSubSystem = (sys: string) => {
    const current = data.ayushSubSystems || [];
    const next = current.includes(sys) ? current.filter((s) => s !== sys) : [...current, sys];
    onChange({ ayushSubSystems: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[22px] font-bold text-foreground">Tell us about your hospital</h2>
        <p className="text-sm text-muted-foreground mt-1">This takes about 1 minute</p>
      </div>

      <div className="space-y-4 mt-8">
        <div>
          <Label>Hospital Name *</Label>
          <Input
            value={data.hospitalName}
            onChange={(e) => onChange({ hospitalName: e.target.value })}
            placeholder="e.g. Apollo General Hospital"
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Hospital Category *</Label>
            <Select
              value={data.hospitalBroadCategory}
              onValueChange={(v) => onChange({ hospitalBroadCategory: v, hospitalType: "", isTeachingInstitution: false, ayushSubSystems: [] })}
            >
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {BROAD_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Hospital Type *</Label>
            <Select
              value={data.hospitalType}
              onValueChange={(v) => onChange({ hospitalType: v, isTeachingInstitution: false, ayushSubSystems: [] })}
              disabled={!data.hospitalBroadCategory}
            >
              <SelectTrigger className="mt-1.5"><SelectValue placeholder={data.hospitalBroadCategory ? "Select type" : "Pick a category first"} /></SelectTrigger>
              <SelectContent>
                {typesInCategory.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedType?.teachingOverlayEligible && (
          <div className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2.5">
            <Checkbox
              id="teaching"
              checked={data.isTeachingInstitution}
              onCheckedChange={(v) => onChange({ isTeachingInstitution: !!v })}
              className="mt-0.5"
            />
            <label htmlFor="teaching" className="text-sm text-foreground leading-snug cursor-pointer">
              This is a teaching institution / medical college (affiliated)
            </label>
          </div>
        )}

        {selectedType?.subSystems && (
          <div>
            <Label>Which system(s) do you practice? *</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1.5">
              {selectedType.subSystems.map((sys) => (
                <label key={sys} className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                  <Checkbox
                    checked={(data.ayushSubSystems || []).includes(sys)}
                    onCheckedChange={() => toggleSubSystem(sys)}
                  />
                  {sys}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>State *</Label>
          <Select value={data.state} onValueChange={(v) => onChange({ state: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select state" /></SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Approximate Bed Count *</Label>
          <Select value={data.bedCount} onValueChange={(v) => onChange({ bedCount: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select range" /></SelectTrigger>
            <SelectContent>
              {BED_COUNTS.map((b) => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Your Mobile Number *</Label>
          <Input
            type="tel"
            value={data.phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
              onChange({ phone: digits, phoneVerified: false, phoneOtpToken: "" });
            }}
            placeholder="+91 98765 43210"
            maxLength={10}
            className="mt-1.5"
          />
          {otpRequired && (
            <PhoneOtpVerify
              phone={data.phone}
              verified={data.phoneVerified}
              onVerified={(token) => onChange({ phoneVerified: true, phoneOtpToken: token })}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Step1HospitalIdentity;
