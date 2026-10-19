import { useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertCircle, ExternalLink, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useCnb } from "@/hooks/use-cnb";
import type { AuthInfo } from "@/lib/cnb";

const SOURCE = { saved: "系统凭据存储", session: "仅本次会话", environment: "CNB_TOKEN 环境变量", cli: "本机 CLI 登录态" };
const PERMISSIONS = [
  { scope: "account-profile:r", label: "读取当前用户" },
  { scope: "account-engage:r", label: "读取所属组织和仓库" },
  { scope: "group-resource:r", label: "读取组织用量和额度" },
  { scope: "repo-issue:r", label: "读取 Issue" },
  { scope: "repo-notes:r", label: "读取 Issue 评论及 NPC 状态" },
];
export function TokenSettings() {
  const { auth, authError, refresh } = useCnb();
  const [token, setToken] = useState("");
  const [persist, setPersist] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const desktop = isTauri();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await invoke<AuthInfo>("auth_save", { token: token.trim(), persist });
      setToken("");
      setSuccess(persist ? "Token 已验证并保存，正在读取真实数据。" : "Token 已验证，仅本次会话使用；退出后重新检测已有凭据。正在读取真实数据。");
      void refresh();
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setError(null); setSuccess(null);
    try {
      await invoke<AuthInfo>("auth_clear");
      setToken("");
      setSuccess("已移除应用配置的 Token，将重新检测环境变量或本机 CLI 登录态。");
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  return <Card>
    <CardHeader>
      <CardTitle>连接 CNB</CardTitle>
      <CardDescription>配置个人访问令牌，查看组织资源用量与任务进展。</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {auth && <Badge variant="secondary">认证来源：{SOURCE[auth.source]}</Badge>}
      {auth && !auth.environmentPresent && auth.source === "cli" && <Alert><KeyRound /><AlertTitle>未检测到 CNB_TOKEN</AlertTitle><AlertDescription>可在下方填入个人访问令牌。已有本机 cnb-cli 登录态时，应用也会尝试读取。</AlertDescription></Alert>}
      {!desktop && <Alert><AlertTitle>桌面应用中配置</AlertTitle><AlertDescription>浏览器预览不连接 CNB，也不保存 Token。请打开桌面应用完成配置。</AlertDescription></Alert>}
      <FieldGroup>
        <Field>
          <FieldLabel>所需权限</FieldLabel>
          <FieldDescription>在 CNB「个人设置 → 访问令牌」创建令牌，勾选以下只读权限，并将使用范围覆盖需要查看的资源。组织用量还受账号角色限制。</FieldDescription>
          <ul className="flex flex-col gap-2 text-sm">
            {PERMISSIONS.map(({ scope, label }) => <li key={scope}><code className="select-text font-mono">{scope}</code><span className="text-muted-foreground"> · {label}</span></li>)}
          </ul>
          <Button variant="outline" className="self-start" onClick={() => {
            if (desktop) void openUrl("https://cnb.cool/profile/token").catch(() => setError("无法打开 CNB，请在浏览器进入个人设置创建访问令牌。"));
            else window.open("https://cnb.cool/profile/token", "_blank", "noopener,noreferrer");
          }}><ExternalLink data-icon="inline-start" />创建访问令牌</Button>
        </Field>
      </FieldGroup>
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
        <FieldGroup>
          <Field data-invalid={!!error} data-disabled={!desktop || busy}>
            <FieldLabel htmlFor="cnb-token">CNB Token</FieldLabel>
            <Input id="cnb-token" type="password" autoComplete="off" spellCheck={false} value={token} placeholder={auth?.savedToken ? "输入新的 Token 以替换" : "填入个人访问令牌"}
              disabled={!desktop || busy} aria-invalid={!!error} aria-describedby="token-help" onChange={(event) => { setToken(event.target.value); setError(null); }} />
            <FieldDescription id="token-help">验证通过后保存。Token 不会写入应用设置、浏览器存储或日志。</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field orientation="horizontal" data-disabled={!desktop || busy}>
            <FieldContent><FieldLabel htmlFor="token-persist">记住 Token</FieldLabel><FieldDescription>存储在系统凭据管理器。关闭后新 Token 仅在本次会话使用，重启后恢复已有凭据。</FieldDescription></FieldContent>
            <Switch id="token-persist" checked={persist} disabled={!desktop || busy} onCheckedChange={setPersist} />
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!desktop || busy || !token.trim()}>{busy ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}验证并{persist ? "保存" : "使用"}</Button>
          {(auth?.savedToken || auth?.source === "session") && <Button type="button" variant="outline" disabled={busy} onClick={() => void clear()}>移除 Token</Button>}
        </div>
      </form>
      {(auth?.storageError || authError) && <Alert variant="destructive"><AlertCircle /><AlertTitle>凭据存储不可用</AlertTitle><AlertDescription>{auth?.storageError ?? authError}</AlertDescription></Alert>}
      {success && <Alert role="status"><AlertTitle>配置已更新</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
    </CardContent>
  </Card>;
}
