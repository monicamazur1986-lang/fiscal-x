"use client";

import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { redirect } from 'next/navigation';

import React from 'react';

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
  
}) {
  return (
    <div>
      <h1>Bem-vindo ao vigilanT!</h1>
      {children}
    </div>
  );
}