
"use client"
import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "./ui/textarea";

// Custom hook to auto-resize a textarea
function useAutosizeTextArea(
  textAreaRef: HTMLTextAreaElement | null,
  value: string
) {
  useEffect(() => {
    if (textAreaRef) {
      // We need to reset the height momentarily to get the correct scrollHeight for the text content
      textAreaRef.style.height = "0px";
      const scrollHeight = textAreaRef.scrollHeight;

      // We then set the height directly, outside of the render loop
      // Trying to set this with state or a ref will product an incorrect value.
      textAreaRef.style.height = scrollHeight + "px";
    }
  }, [textAreaRef, value]);
}

interface AutosizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  // You can add any other props you want to pass to the textarea
}

export const AutosizeTextarea = React.forwardRef<HTMLTextAreaElement, AutosizeTextareaProps>(
  (props, ref) => {
    const { value, className, ...rest } = props;
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    // This is to merge the forwardRef with the internal ref
    React.useImperativeHandle(ref, () => textAreaRef.current as HTMLTextAreaElement);

    useAutosizeTextArea(textAreaRef.current, props.value as string);

    return (
      <Textarea
        ref={textAreaRef}
        className={cn("autosize-textarea", className)}
        {...rest}
        value={value}
      />
    );
  }
);
AutosizeTextarea.displayName = "AutosizeTextarea";
