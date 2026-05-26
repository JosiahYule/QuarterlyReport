import React from "react";

export function PageLoader() {
  return (
    <>
      <div className="page-loader">
        <div className="page-loader-fill" />
      </div>
      <main className="report-wrap page-loading" />
    </>
  );
}
