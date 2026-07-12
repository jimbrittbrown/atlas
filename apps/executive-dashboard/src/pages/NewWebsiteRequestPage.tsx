import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createCustomerWebsiteRequest } from '../api/client';
import type { CustomerRequestPayload, CustomerRequestResponse } from '../api/types';
import { DashboardApiError } from '../api/errors';

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function fileListToMetadata(files: FileList | null): Array<{ name: string; size: number; type: string }> {
  if (!files) return [];
  return Array.from(files).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type
  }));
}

type NewWebsiteRequestPageProps = {
  token?: string;
  customerId: string;
  accountId: string;
  sessionToken?: string;
};

export function NewWebsiteRequestPage({ token, customerId, accountId, sessionToken }: NewWebsiteRequestPageProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<DashboardApiError | null>(null);
  const [confirmation, setConfirmation] = useState<CustomerRequestResponse | null>(null);
  const [logoUpload, setLogoUpload] = useState<{ name: string; size: number; type: string } | null>(null);
  const [imageUploads, setImageUploads] = useState<Array<{ name: string; size: number; type: string }>>([]);
  const [brandAssetsUpload, setBrandAssetsUpload] = useState<Array<{ name: string; size: number; type: string }>>([]);

  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    websiteUrl: '',
    contactName: '',
    email: '',
    phone: '',
    targetAudience: '',
    businessDescription: '',
    goals: '',
    budget: '',
    timeline: '',
    preferredStyle: '',
    preferredColors: '',
    desiredPages: '',
    specialFeatures: '',
    competitors: '',
    notes: ''
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload: CustomerRequestPayload = {
      businessName: form.businessName,
      businessType: form.businessType,
      websiteUrl: form.websiteUrl || undefined,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      targetAudience: form.targetAudience,
      businessDescription: form.businessDescription,
      goals: splitCsv(form.goals),
      budget: form.budget,
      timeline: form.timeline,
      preferredStyle: form.preferredStyle || undefined,
      preferredColors: splitCsv(form.preferredColors),
      desiredPages: splitCsv(form.desiredPages),
      specialFeatures: splitCsv(form.specialFeatures),
      competitors: splitCsv(form.competitors),
      notes: form.notes || undefined,
      logoUpload,
      imageUploads,
      brandAssetsUpload
    };

    try {
      const response = await createCustomerWebsiteRequest(payload, {
        token,
        customerId: customerId || undefined,
        accountId: accountId || undefined,
        sessionToken: sessionToken || undefined
      });
      setConfirmation(response);
    } catch (err) {
      setError(err as DashboardApiError);
    } finally {
      setSaving(false);
    }
  };

  const bind = (field: keyof typeof form) => ({
    value: form[field],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    }
  });

  return (
    <>
      <section className="panel">
        <h2>New Website Request</h2>
        <p>Production intake submits directly to Mission Control and routes to WEBSITE_BUILD.</p>
      </section>

      {confirmation ? (
        <section className="panel success-panel" role="status">
          <h3>Request Submitted</h3>
          <p>{confirmation.message}</p>
          <p>Mission ID: {confirmation.missionId}</p>
          <p><Link to={`/portal/project/${confirmation.missionId}`}>Open tracking page</Link></p>
        </section>
      ) : null}

      {error ? (
        <section className="panel" role="alert">
          <h3>Submission Error</h3>
          <p>{error.message}</p>
        </section>
      ) : null}

      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>Business Name<input required {...bind('businessName')} /></label>
        <label>Business Type<input required {...bind('businessType')} /></label>
        <label>Website URL (optional)<input type="url" {...bind('websiteUrl')} /></label>
        <label>Contact Name<input required {...bind('contactName')} /></label>
        <label>Email<input type="email" required {...bind('email')} /></label>
        <label>Phone<input required {...bind('phone')} /></label>
        <label>Target Audience<input required {...bind('targetAudience')} /></label>
        <label>Business Description<textarea required {...bind('businessDescription')} /></label>
        <label>Goals (comma-separated)<textarea required {...bind('goals')} /></label>
        <label>Budget<input required placeholder="$5,000 - $10,000" {...bind('budget')} /></label>
        <label>Timeline<input required placeholder="6 weeks" {...bind('timeline')} /></label>
        <label>Preferred Style<input {...bind('preferredStyle')} /></label>
        <label>Preferred Colors (comma-separated)<input {...bind('preferredColors')} /></label>
        <label>Desired Pages (comma-separated)<input required {...bind('desiredPages')} /></label>
        <label>Special Features (comma-separated)<input {...bind('specialFeatures')} /></label>
        <label>Competitors (comma-separated)<input {...bind('competitors')} /></label>
        <label>Notes<textarea {...bind('notes')} /></label>

        <label>
          Logo Upload
          <input
            type="file"
            onChange={(event) => {
              const files = fileListToMetadata(event.target.files);
              setLogoUpload(files[0] ?? null);
            }}
          />
        </label>

        <label>
          Image Uploads
          <input
            type="file"
            multiple
            onChange={(event) => setImageUploads(fileListToMetadata(event.target.files))}
          />
        </label>

        <label>
          Brand Assets Upload
          <input
            type="file"
            multiple
            onChange={(event) => setBrandAssetsUpload(fileListToMetadata(event.target.files))}
          />
        </label>

        <button type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit Website Request'}</button>
      </form>
    </>
  );
}
