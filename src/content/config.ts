import { defineCollection, z } from "astro:content";

const classNotes = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    course: z.string(),
    date: z.coerce.date(),
  }),
});

export const collections = {
  classNotes,
};
