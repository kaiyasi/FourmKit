import { useEffect, useState } from 'react'
import { Plus, Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquare, User, LogOut, Wrench, Activity, FileText, HelpCircle } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Link } from 'react-router-dom'
import { getRole, Role } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'

type Action = { to: string; label: string; icon: any; require?: (role: Role) => boolean }

export function MobileFabNav() { return null }
