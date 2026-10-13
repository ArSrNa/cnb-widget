import type { ReactNode } from "react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";

export function PageHeading({ title, description, media, action }: {
  title: string;
  description: string;
  media: ReactNode;
  action?: ReactNode;
}) {
  return (
    <ItemGroup>
      <Item>
        <ItemMedia>{media}</ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle><h1>{title}</h1></ItemTitle>
          <ItemDescription>{description}</ItemDescription>
        </ItemContent>
        {action && <ItemActions className="flex-wrap">{action}</ItemActions>}
      </Item>
    </ItemGroup>
  );
}
