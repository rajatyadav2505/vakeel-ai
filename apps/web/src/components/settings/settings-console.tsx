'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Shield, User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER } from '@/lib/llm-settings';

const COMPLIANCE_ITEMS = [
  { label: 'Lawyer verification before petition export', active: true },
  { label: 'AI audit logging for every generation run', active: true },
  { label: 'Rate limiting on API and message workflows', active: true },
  { label: 'DPDP consent banner on every screen', active: true },
];

const PROVIDERS = [
  'groq',
  'sarvam',
  'google',
  'openrouter',
  'cerebras',
  'deepseek',
  'github',
  'openai',
  'anthropic',
  'ollama',
] as const;

const PROVIDER_DEFAULTS: Record<(typeof PROVIDERS)[number], { model: string; baseUrl: string }> = {
  sarvam: { model: 'sarvam-m', baseUrl: 'https://api.sarvam.ai/v1' },
  openai: { model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' },
  google: {
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  openrouter: { model: 'openrouter/free', baseUrl: 'https://openrouter.ai/api/v1' },
  groq: { model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1' },
  cerebras: { model: 'gpt-oss-120b', baseUrl: 'https://api.cerebras.ai/v1' },
  deepseek: { model: 'deepseek-reasoner', baseUrl: 'https://api.deepseek.com/v1' },
  github: { model: 'DeepSeek-R1', baseUrl: 'https://models.inference.ai.azure.com' },
  anthropic: { model: 'claude-3-7-sonnet-latest', baseUrl: 'https://api.anthropic.com/v1' },
  ollama: { model: 'llama3.1:8b', baseUrl: 'http://localhost:11434/v1' },
};

interface SettingsPayload {
  llmProvider: (typeof PROVIDERS)[number];
  llmModel: string;
  llmBaseUrl: string;
  notificationsEnabled: boolean;
  realtimeUpdatesEnabled: boolean;
  freeTierOnly: boolean;
  defaultPageSize: number;
  timezone: string;
  preferredLanguage: 'en-IN' | 'hi-IN';
  kautilyaCeresEnabled: boolean;
  kautilyaCeresDefaultMode: 'robust_mode' | 'exploit_mode';
  kautilyaCeresComputeMode: 'fast' | 'standard' | 'full';
  hasLlmApiKey: boolean;
  llmApiKeyMasked: string;
}

const DEFAULT_SETTINGS: SettingsPayload = {
  llmProvider: DEFAULT_LLM_PROVIDER,
  llmModel: DEFAULT_LLM_MODEL,
  llmBaseUrl: DEFAULT_LLM_BASE_URL,
  notificationsEnabled: true,
  realtimeUpdatesEnabled: true,
  freeTierOnly: true,
  defaultPageSize: 12,
  timezone: 'Asia/Kolkata',
  preferredLanguage: 'en-IN',
  kautilyaCeresEnabled: true,
  kautilyaCeresDefaultMode: 'robust_mode',
  kautilyaCeresComputeMode: 'standard',
  hasLlmApiKey: false,
  llmApiKeyMasked: '',
};

export function SettingsConsole(props: {
  user: {
    fullName: string;
    role: string;
    barCouncilId: string | null;
  };
}) {
  const [settings, setSettings] = useState<SettingsPayload>(DEFAULT_SETTINGS);
  const [llmApiKeyInput, setLlmApiKeyInput] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [status, setStatus] = useState('Loading settings...');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const response = await fetch('/api/settings', { method: 'GET' });
      if (!response.ok) {
        setStatus('Failed to load settings.');
        return;
      }
      const payload = (await response.json()) as { settings?: SettingsPayload };
      if (payload.settings) {
        setSettings(payload.settings);
      }
      setStatus('Settings loaded.');
    }

    void loadSettings();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus('Saving settings...');

    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llmProvider: settings.llmProvider,
        llmModel: settings.llmModel,
        llmBaseUrl: settings.llmBaseUrl,
        notificationsEnabled: settings.notificationsEnabled,
        realtimeUpdatesEnabled: settings.realtimeUpdatesEnabled,
        freeTierOnly: settings.freeTierOnly,
        defaultPageSize: settings.defaultPageSize,
        timezone: settings.timezone,
        preferredLanguage: settings.preferredLanguage,
        kautilyaCeresEnabled: settings.kautilyaCeresEnabled,
        kautilyaCeresDefaultMode: settings.kautilyaCeresDefaultMode,
        kautilyaCeresComputeMode: settings.kautilyaCeresComputeMode,
        llmApiKey: llmApiKeyInput.trim() || undefined,
        clearLlmApiKey: clearApiKey,
      }),
    });

    const payload = (await response.json()) as { settings?: SettingsPayload; error?: string };
    if (!response.ok || !payload.settings) {
      setStatus(payload.error ?? 'Failed to save settings.');
      setSaving(false);
      return;
    }

    setSettings(payload.settings);
    setLlmApiKeyInput('');
    setClearApiKey(false);
    setStatus('Settings saved.');
    setSaving(false);
  }

  async function onTestConnection() {
    setTesting(true);
    setStatus('Testing LLM connectivity...');

    const response = await fetch('/api/settings/test-llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: settings.llmProvider,
        model: settings.llmModel,
        baseUrl: settings.llmBaseUrl,
        apiKey: llmApiKeyInput.trim() || undefined,
        freeTierOnly: settings.freeTierOnly,
      }),
    });

    const payload = (await response.json()) as { ok?: boolean; error?: string; latencyMs?: number };
    if (!response.ok || !payload.ok) {
      setStatus(payload.error ?? 'Connectivity test failed.');
      setTesting(false);
      return;
    }

    setStatus(`Connectivity test passed (${payload.latencyMs ?? 0} ms).`);
    setTesting(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-[Georgia] text-xl font-semibold">Settings & Compliance</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
              <User className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Profile</p>
              <p className="text-xs text-muted-foreground">Your account details</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{props.user.fullName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge>{props.user.role}</Badge>
            </div>
            {props.user.barCouncilId && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bar Council ID</span>
                <span className="font-mono text-xs">{props.user.barCouncilId}</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <Shield className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Compliance controls</p>
              <p className="text-xs text-muted-foreground">Mandatory safeguards</p>
            </div>
          </div>
          <div className="space-y-2">
            {COMPLIANCE_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
            <Activity className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">Service configuration</p>
            <p className="text-xs text-muted-foreground">Editable runtime controls</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          <Label>
            LLM provider
            <Select
              value={settings.llmProvider}
              onChange={(event) =>
                setSettings((current) => {
                  const provider = event.target.value as SettingsPayload['llmProvider'];
                  const defaults = PROVIDER_DEFAULTS[provider];
                  return {
                    ...current,
                    llmProvider: provider,
                    llmModel: defaults.model,
                    llmBaseUrl: defaults.baseUrl,
                  };
                })
              }
            >
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </Select>
          </Label>

          <Label>
            Model
            <Input
              value={settings.llmModel}
              onChange={(event) =>
                setSettings((current) => ({ ...current, llmModel: event.target.value }))
              }
              placeholder={PROVIDER_DEFAULTS[settings.llmProvider].model}
              required
            />
          </Label>

          <Label>
            Base URL (optional)
            <Input
              value={settings.llmBaseUrl}
              onChange={(event) =>
                setSettings((current) => ({ ...current, llmBaseUrl: event.target.value }))
              }
              placeholder={PROVIDER_DEFAULTS[settings.llmProvider].baseUrl}
            />
          </Label>

          <Label>
            LLM API key
            <Input
              value={llmApiKeyInput}
              onChange={(event) => setLlmApiKeyInput(event.target.value)}
              placeholder={
                settings.hasLlmApiKey
                  ? `Stored: ${settings.llmApiKeyMasked}`
                  : 'Enter API key to store securely'
              }
              type="password"
            />
          </Label>

          <Label>
            Default page size
            <Input
              type="number"
              min={5}
              max={50}
              value={settings.defaultPageSize}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  defaultPageSize: Math.max(5, Math.min(50, Number(event.target.value) || 12)),
                }))
              }
            />
          </Label>

          <Label>
            Timezone
            <Input
              value={settings.timezone}
              onChange={(event) =>
                setSettings((current) => ({ ...current, timezone: event.target.value }))
              }
              placeholder="Asia/Kolkata"
            />
          </Label>

          <Label>
            Preferred language
            <Select
              value={settings.preferredLanguage}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  preferredLanguage: event.target.value as SettingsPayload['preferredLanguage'],
                }))
              }
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (India)</option>
            </Select>
          </Label>

          <Label>
            KAUTILYA_CERES mode
            <Select
              value={settings.kautilyaCeresDefaultMode}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  kautilyaCeresDefaultMode: event.target.value as SettingsPayload['kautilyaCeresDefaultMode'],
                }))
              }
            >
              <option value="robust_mode">Robust mode</option>
              <option value="exploit_mode">Exploit mode</option>
            </Select>
          </Label>

          <Label>
            KAUTILYA_CERES compute
            <Select
              value={settings.kautilyaCeresComputeMode}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  kautilyaCeresComputeMode: event.target.value as SettingsPayload['kautilyaCeresComputeMode'],
                }))
              }
            >
              <option value="fast">Fast</option>
              <option value="standard">Standard</option>
              <option value="full">Full</option>
            </Select>
          </Label>

          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={settings.notificationsEnabled}
                onCheckedChange={(checked) =>
                  setSettings((current) => ({ ...current, notificationsEnabled: checked }))
                }
              />
              <span>Enable workflow notifications</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                checked={settings.realtimeUpdatesEnabled}
                onCheckedChange={(checked) =>
                  setSettings((current) => ({ ...current, realtimeUpdatesEnabled: checked }))
                }
              />
              <span>Enable real-time channel updates</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                checked={settings.freeTierOnly}
                onCheckedChange={(checked) =>
                  setSettings((current) => ({ ...current, freeTierOnly: checked }))
                }
              />
              <span>Enforce free-tier only (block potentially billable models)</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                checked={settings.kautilyaCeresEnabled}
                onCheckedChange={(checked) =>
                  setSettings((current) => ({ ...current, kautilyaCeresEnabled: checked }))
                }
              />
              <span>Enable KAUTILYA_CERES strategy engine</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Checkbox checked={clearApiKey} onCheckedChange={setClearApiKey} />
              <span>Clear saved API key on save</span>
            </div>
          </div>

          <div className="md:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save settings'}
            </Button>
            <Button type="button" variant="outline" disabled={testing} onClick={() => void onTestConnection()}>
              {testing ? 'Testing...' : 'Test LLM connection'}
            </Button>
            <p className="text-xs text-muted-foreground">{status}</p>
          </div>
        </form>
      </Card>
    </div>
  );
}
