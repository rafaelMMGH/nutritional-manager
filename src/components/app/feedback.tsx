"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/client/api";

type ConfirmationRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
};

let requestConfirmation: ((title: string, description: string, confirmLabel?: string) => Promise<boolean>) | null = null;

export function confirmDialog(title: string, description: string, confirmLabel = "Confirmar") {
  return requestConfirmation?.(title, description, confirmLabel) ?? Promise.resolve(false);
}

export function ConfirmationDialogHost() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);

  useEffect(() => {
    requestConfirmation = (title, description, confirmLabel = "Confirmar") =>
      new Promise<boolean>((resolve) => {
        setRequest({ title, description, confirmLabel, resolve });
      });
    return () => {
      requestConfirmation = null;
    };
  }, []);

  function close(confirmed: boolean) {
    request?.resolve(confirmed);
    setRequest(null);
  }

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) close(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => close(true)}>{request?.confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warn" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Empty({ message }: { message: string }) {
  return <div className="empty">{message}</div>;
}

export function Action({ label, onClick, danger }: { label: string; onClick: () => void | Promise<void>; danger?: boolean }) {
  return <Button variant={danger ? "destructive" : "secondary"} onClick={async () => { try { await onClick(); } catch (err) { toast.error("No se pudo completar la accion", { description: getErrorMessage(err) }); } }}>{label}</Button>;
}

export function FullScreenLoading() {
  return <div className="loading"><Loader2 className="spin" /> Cargando</div>;
}
