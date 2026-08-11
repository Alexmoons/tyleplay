import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Bookmark,
  Calendar,
  Camera,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  Database,
  Download,
  Ellipsis,
  Facebook,
  Filter,
  Folder,
  Gamepad2,
  Github,
  Globe,
  House,
  Info,
  Instagram,
  Joystick,
  LayoutGrid,
  Lock,
  Mail,
  MessageCircle,
  Minus,
  Monitor,
  Moon,
  Pencil,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Send,
  Settings,
  Shield,
  Square,
  Star,
  Sun,
  Tag,
  TimerReset,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Twitch,
  Twitter,
  User,
  Users,
  X,
  Grid2x2,
} from "lucide-react";

const iconProps = {
  "aria-hidden": true,
  strokeWidth: 1.8,
};

function render(Icon, props) {
  return <Icon {...iconProps} {...props} />;
}

export function NavIcon({ type, ...props }) {
  switch (type) {
    case "home":
      return <HomeIcon {...props} />;
    case "grid":
      return <GridIcon {...props} />;
    case "layout-grid":
      return <LayoutGridIcon {...props} />;
    case "rows":
      return <RowsIcon {...props} />;
    case "clock":
      return <ClockIcon {...props} />;
    case "chart":
      return <ChartIcon {...props} />;
    case "trophy":
      return <TrophyIcon {...props} />;
    case "bookmark":
      return <BookmarkIcon {...props} />;
    case "gamepad":
      return <GamepadOutlineIcon {...props} />;
    case "trend":
      return <TrendLineIcon {...props} />;
    case "star":
      return <StarIcon {...props} />;
    case "folder":
      return <FolderIcon {...props} />;
    case "download":
      return <DownloadIcon {...props} />;
    default:
      return <GridIcon {...props} />;
  }
}

export function HomeIcon(props) {
  return render(House, props);
}

export function GridIcon(props) {
  return render(Grid2x2, props);
}

export function LayoutGridIcon(props) {
  return render(LayoutGrid, props);
}

export function RowsIcon(props) {
  return render(Rows3, props);
}

export function ClockIcon(props) {
  return render(Clock3, props);
}

export function PlayIcon(props) {
  return render(Play, props);
}

export function InfoCircleIcon(props) {
  return render(Info, props);
}

export function CheckCircleIcon(props) {
  return render(CircleCheck, props);
}

export function ChartIcon(props) {
  return render(ChartColumn, props);
}

export function TrophyIcon(props) {
  return render(Trophy, props);
}

export function BookmarkIcon(props) {
  return render(Bookmark, props);
}

export function CogIcon(props) {
  return render(Settings, props);
}

export function SearchIcon(props) {
  return render(Search, props);
}

export function FilterIcon(props) {
  return render(Filter, props);
}

export function GamepadOutlineIcon(props) {
  return render(Gamepad2, props);
}

export function TrendLineIcon(props) {
  return render(TrendingUp, props);
}

export function PlusIcon(props) {
  return render(Plus, props);
}

export function TrashIcon(props) {
  return render(Trash2, props);
}

export function StarIcon(props) {
  return render(Star, props);
}

export function MoreIcon(props) {
  return render(Ellipsis, props);
}

export function MinimizeIcon(props) {
  return render(Minus, props);
}

export function MaximizeIcon(props) {
  return render(Square, props);
}

export function RestoreIcon(props) {
  return render(Copy, props);
}

export function CloseIcon(props) {
  return render(X, props);
}

export function ChevronDownIcon(props) {
  return render(ChevronDown, props);
}

export function ChevronLeftIcon(props) {
  return render(ChevronLeft, props);
}

export function ChevronRightIcon(props) {
  return render(ChevronRight, props);
}

export function ArrowLeftIcon(props) {
  return render(ArrowLeft, props);
}

export function ExportIcon(props) {
  return render(Download, props);
}

export function DownloadIcon(props) {
  return render(Download, props);
}

export function BellIcon(props) {
  return render(Bell, props);
}

export function CalendarIcon(props) {
  return render(Calendar, props);
}

export function StopwatchIcon(props) {
  return render(TimerReset, props);
}

export function RefreshIcon(props) {
  return render(RefreshCw, props);
}

export function PencilIcon(props) {
  return render(Pencil, props);
}

export function LockIcon(props) {
  return render(Lock, props);
}

export function TagIcon(props) {
  return render(Tag, props);
}

export function MonitorIcon(props) {
  return render(Monitor, props);
}

export function UsersIcon(props) {
  return render(Users, props);
}

export function UserIcon(props) {
  return render(User, props);
}

export function ShieldIcon(props) {
  return render(Shield, props);
}

export function GlobeIcon(props) {
  return render(Globe, props);
}

export function MailIcon(props) {
  return render(Mail, props);
}

export function PhoneIcon(props) {
  return render(Phone, props);
}

export function CameraIcon(props) {
  return render(Camera, props);
}

export function DiscordIcon(props) {
  return render(MessageCircle, props);
}

export function SteamIcon(props) {
  return render(Joystick, props);
}

export function TwitchIcon(props) {
  return render(Twitch, props);
}

export function XIcon(props) {
  return render(Twitter, props);
}

export function MoonIcon(props) {
  return render(Moon, props);
}

export function SunIcon(props) {
  return render(Sun, props);
}

export function DatabaseIcon(props) {
  return render(Database, props);
}

export function FolderIcon(props) {
  return render(Folder, props);
}

export function WarningTriangleIcon(props) {
  return render(TriangleAlert, props);
}

export function GithubIcon(props) {
  return render(Github, props);
}

export function InstagramIcon(props) {
  return render(Instagram, props);
}

export function FacebookIcon(props) {
  return render(Facebook, props);
}

export function TelegramIcon(props) {
  return render(Send, props);
}

export function PlayTriangleIcon(props) {
  return render(Play, props);
}

export function PlaySolidIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

export function GamepadIcon(props) {
  return render(Gamepad2, props);
}

export function ArrowRightIcon(props) {
  return render(ArrowRight, props);
}

export function ArrowUpIcon(props) {
  return render(ArrowUp, props);
}
