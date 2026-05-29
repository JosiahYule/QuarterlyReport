import React from "react";
import { PageSkeleton } from "./Skeleton.jsx";

export function PageLoader({ view }) {
  return (
    <>
      <div className="page-loader" role="progressbar" aria-label="Loading page content" aria-valuemin={0} aria-valuemax={100}>
        <div className="page-loader-fill" />
      </div>
      <PageSkeleton view={view} />
    </>
  );
}
