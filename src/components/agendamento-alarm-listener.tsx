'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing } from 'lucide-react';
import { escutarAlertasEmPrimeiroPlano } from '@/lib/firebase-messaging';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

// Mesmo bipe usado no aviso de recados, só que em loop até o fiscal dispensar
// — para se comportar como um despertador, não como um toast que some sozinho.
const ALARM_SOUND = "data:audio/wav;base64,UklGRl9vT19XQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YV9vT18A7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+";

export function AgendamentoAlarmListener() {
  const [alarme, setAlarme] = useState<{ title: string; body: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(ALARM_SOUND);
      audioRef.current.loop = true;
    }

    let unsub: (() => void) | undefined;
    let cancelled = false;

    escutarAlertasEmPrimeiroPlano((payload) => {
      setAlarme({ title: payload.title || 'Lembrete de Agendamento', body: payload.body || '' });
      audioRef.current?.play().catch(() => {
        console.log('Áudio bloqueado pelo navegador.');
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unsub = fn;
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const dispensar = () => {
    setAlarme(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  return (
    <AlertDialog open={!!alarme} onOpenChange={(o) => !o && dispensar()}>
      <AlertDialogContent className="rounded-[2rem]">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 animate-pulse">
            <BellRing className="h-7 w-7" />
          </div>
          <AlertDialogTitle className="text-center font-black uppercase tracking-tighter text-xl italic">
            {alarme?.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {alarme?.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dispensar} className="w-full rounded-xl font-black uppercase text-[10px] tracking-widest bg-emerald-600 hover:bg-emerald-700">
            Dispensar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
