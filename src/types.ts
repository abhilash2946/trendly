// Subcategories for each wardrobe category
export const SUBCATEGORIES: Record<string, string[]> = {
  Tops: ['T-Shirt', 'Shirt', 'Blouse', 'Sweater', 'Tank Top', 'Hoodie', 'Jacket'],
  Bottoms: ['Jeans', 'Pants', 'Shorts', 'Skirt', 'Leggings', 'Trousers'],
  Dresses: ['Casual Dress', 'Evening Dress', 'Sundress', 'Maxi Dress', 'Mini Dress'],
  Outerwear: ['Coat', 'Blazer', 'Raincoat', 'Vest', 'Cardigan'],
  Shoes: ['Sneakers', 'Boots', 'Sandals', 'Heels', 'Flats', 'Loafers'],
  Accessories: ['Hat', 'Scarf', 'Belt', 'Bag', 'Necklace', 'Ring', 'Bracelet', 'Earrings', 'Watch', 'Sunglasses', 'Gloves']
};
import {
  Shirt,
  Scan,
  ShoppingBag,
  User,
  MessageSquare,
  Sparkles,
  Calendar,
  Camera,
  Scissors,
  LayoutDashboard,
  Heart,
  Settings,
  Search,
  Plus,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCcw,
  Zap,
  Check,
  Menu,
  Bell,
  MapPin,
  History,
  Info,
  Share2,
  LogOut,
  Trash2,
  Filter,
  ArrowUpDown,
  Edit3,
  Wand2,
  Brain,
  X,
  Image
} from 'lucide-react';

export type WardrobeCategory = 'Tops' | 'Bottoms' | 'Dresses' | 'Outerwear' | 'Shoes' | 'Accessories';
export type WardrobeSubCategory = string;

export type ConversationRole = 'user' | 'assistant';

export type PlannerSource = 'ai-stylist' | 'event-scanner' | 'shopping' | 'outfit-generator' | 'wardrobe';

export interface WardrobeItemRecord {
  id: string;
  user_id: string;
  image_url: string;
  category: WardrobeCategory;
  sub_category: WardrobeSubCategory | null;
  color: string | null;
  name: string;
  tags: string[];
  created_at: string;
}

export interface OutfitRecord {
  id: string;
  user_id: string;
  name: string;
  items: string[];
  combo_type: string;
  image_url: string | null;
  score: number;
  created_at: string;
}

export interface FavoriteOutfitRecord {
  id: string;
  user_id: string;
  outfit_id: string;
  created_at: string;
}

export interface ProfileRecord {
  id: string;
  username: string | null;
  email: string;
  date_of_birth: string | null;
  gender: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIConversationRecord {
  id: string;
  user_id: string;
  message: string;
  role: ConversationRole;
  created_at: string;
}

export interface EventRecord {
  id: string;
  user_id: string;
  event_type: string;
  location: string | null;
  dress_code: string | null;
  recommended_outfit: string | null;
  date: string;
  created_at: string;
}

export interface SavedLookRecord {
  id: string;
  user_id: string;
  image_url: string;
  prompt: string;
  source: PlannerSource;
  created_at: string;
}

export interface AssistantRecommendation {
  query: string;
  summary: string;
  source: PlannerSource;
  created_at: string;
  imageUrl?: string | null;
  wardrobeItemIds?: string[];
}

export interface ARMirrorSelection {
  title: string;
  description: string;
  source: PlannerSource;
  created_at: string;
  imageUrl?: string | null;
  itemIds?: string[];
  shoppingQuery?: string;
}

export interface LocationDetails {
  city: string;
  state: string;
  country: string;
  displayName: string;
  countryCode?: string;
}

export const ICONS = {
  Shirt,
  Scan,
  ShoppingBag,
  User,
  MessageSquare,
  Sparkles,
  Calendar,
  Camera,
  Scissors,
  LayoutDashboard,
  Heart,
  Settings,
  Search,
  Plus,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCcw,
  Zap,
  Check,
  Menu,
  Bell,
  MapPin,
  History,
  Info,
  Share2,
  LogOut,
  Trash2,
  Filter,
  ArrowUpDown,
  Edit3,
  Wand2,
  Brain,
  X,
  Image
};
