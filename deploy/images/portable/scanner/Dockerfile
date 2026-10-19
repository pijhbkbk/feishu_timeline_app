# Portable-only derived image; the existing staging profile is unchanged.
# Required immutable input (no registry lookup or credentials):
# --build-context scanner-base=oci-layout:///absolute/layout@sha256:17130f6532928a5b4b1272fc5129e5f2639850c0d8086879c516649d32fc8ae6
# The layout must come from the verified Timeline ClamAV 1.4.6 r3 image.
# Without that named context, scratch has no shell and the build fails closed.
FROM scratch AS scanner-base
FROM scanner-base AS runtime

ARG BUILD_SOURCE_COMMIT
ARG BUILD_SOURCE_TREE
ARG BUILD_RELEASE
ARG BUILD_TIME

LABEL org.opencontainers.image.revision="${BUILD_SOURCE_COMMIT}" \
  org.opencontainers.image.version="${BUILD_RELEASE}" \
  org.opencontainers.image.created="${BUILD_TIME}" \
  com.feishu-timeline.source-tree="${BUILD_SOURCE_TREE}" \
  com.feishu-timeline.portable-security-revision="20261019"

# Preserve the project's patched scanner binaries before and after updating OS
# libraries. Exact signed Alpine revisions fail if unavailable; no stock ClamAV
# package replacement or scanner-policy change is permitted here.
RUN printf '%s\n' \
      '553ec5580f9c93bf3b512bf3955260bd43ee37594d12bf5c92f07d256010fc84  /usr/sbin/clamd' \
      'ac4caf341b7c78b14e78aa255cc82570cbcd6f2f2749074c30fb55b02e8e25f4  /usr/bin/clamscan' \
      '35375b2a32cf986e33581d41def18459c5057acdd50b7c12dddd416349df5c0b  /usr/bin/freshclam' \
      '480b39b98a37fa1ba1180d225e6269682dd39799119c7cdf94ed5cc993ccd3fa  /usr/bin/sigtool' \
      'c03b44e3bc10920ac40ab2f1f28e377f09a492ff5da612269422f8101f9b4200  /usr/lib/libclamav.so.12.0.3' \
      > /tmp/timeline-scanner-core.sha256 \
  && sha256sum -c /tmp/timeline-scanner-core.sha256 \
  && apk add --no-cache nghttp2-libs=1.70.0-r0 pcre2=10.49-r0 zlib=1.3.2-r1 \
  && sha256sum -c /tmp/timeline-scanner-core.sha256 \
  && rm /tmp/timeline-scanner-core.sha256
