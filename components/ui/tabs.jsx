import { cn } from "@/lib/utils";
import {
  Tabs as Root,
  TabsList as SegmentedList,
  TabsTrigger as SegmentedTrigger,
  TabsContent,
} from "studio/ui/navigation";

/**
 * App-side shell over the studio tabs primitive, pinned to the segmented rail
 * the app has always used. The previous file was a second, hard-coded tab
 * system carrying a cyan gradient and a `shadow-elevation-1`
 * glow — both banned; the studio recipe replaces them outright.
 */
function Tabs({ className, ...props }) {
  return <Root className={cn("flex flex-col gap-2", className)} {...props} />;
}

function TabsList({ className, ...props }) {
  return <SegmentedList variant="segmented" className={className} {...props} />;
}

function TabsTrigger({ className, ...props }) {
  return <SegmentedTrigger variant="segmented" className={className} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
