import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertCircle, Download, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useUpdate } from "@/hooks/use-update";

export function UpdateSettings() {
  const { update, checking, error, check } = useUpdate();
  const [linkError, setLinkError] = useState<string | null>(null);
  const desktop = isTauri();
  const failed = update?.error ?? error;
  const link = update?.available ? update.link : null;
  const latest = update?.latestVersion;
  const time = (value: number | null) => (value === null ? null : new Date(value).toLocaleString());
  const checkedAt = time(update?.checkedAt ?? null);
  const publishedAt = time(update?.publishedAt ?? null);
  const summary = failed
    ? "未能读取最新版本信息，请检查网络后重试。"
    : !update
      ? checking ? "正在比对发布接口…" : "尚未检查更新。"
      : update.available
        ? [
          `发现新版本 v${latest}。`,
          update.notes && `${update.notes}。`,
          publishedAt && `发布于 ${publishedAt}。`,
          !update.link && "发布接口未提供下载链接。",
        ].filter(Boolean).join(" ")
        : `当前已是最新版本，本机 v${update.currentVersion}，发布接口 v${latest}。`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>检查更新</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!desktop && <Alert><AlertTitle>桌面预览</AlertTitle><AlertDescription>请在桌面应用中检查更新。</AlertDescription></Alert>}
        {failed && <Alert variant="destructive"><AlertCircle /><AlertTitle>检查失败</AlertTitle><AlertDescription>{failed}</AlertDescription></Alert>}
        {linkError && <Alert variant="destructive"><AlertCircle /><AlertTitle>无法打开下载页</AlertTitle><AlertDescription>{linkError}</AlertDescription></Alert>}
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>本机版本</FieldLabel>
              <FieldDescription>
                {update ? `v${update.currentVersion}` : "正在读取版本号…"}
                {checkedAt && ` · 上次检查 ${checkedAt}`}
              </FieldDescription>
            </FieldContent>
            <Button size="sm" variant="outline" disabled={checking || !desktop} onClick={() => void check()}>
              {checking ? <Spinner /> : <RefreshCw />}
              {checking ? "正在检查…" : "检查更新"}
            </Button>
          </Field>
          <FieldSeparator />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>更新结果</FieldLabel>
              <FieldDescription>{summary}</FieldDescription>
            </FieldContent>
            {link && (
              <Button
                size="sm"
                onClick={() => {
                  setLinkError(null);
                  void openUrl(link).catch(() => setLinkError("无法打开浏览器，请稍后手动访问官网下载页。"));
                }}
              >
                <Download />前往下载
              </Button>
            )}
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
