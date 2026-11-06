import { Building2, Calculator, KanbanSquare, LayoutDashboard, MessageCircle, Settings, Users, Zap } from "lucide-react";

export const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/clientes", label: "Clientes", icon: Users },
  { href: "/app/seguradoras", label: "Seguradoras", icon: Building2 },
  { href: "/app/acoes", label: "Ações", icon: Zap },
  { href: "/app/disparos", label: "Disparos", icon: MessageCircle },
  { href: "/app/crm", label: "CRM", icon: KanbanSquare },
  { href: "/app/cotacoes", label: "Cotações", icon: Calculator },
  { href: "/app/configuracoes", label: "Configurações", icon: Settings },
] as const;
