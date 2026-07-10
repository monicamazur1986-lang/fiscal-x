
"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { AlertCircle, CheckCircle2, Info, Sparkles } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex gap-4 items-start w-full">
              <div className="mt-0.5 shrink-0">
                {variant === 'destructive' ? (
                  <div className="p-2 bg-red-50 rounded-xl text-red-600">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="p-2 bg-blue-50 rounded-xl text-primary">
                    <Info className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="grid gap-1 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
