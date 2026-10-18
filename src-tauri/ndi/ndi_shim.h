// The few NDI SDK types the sender uses, laid out exactly as in the NDI SDK headers
// (Processing.NDI.Send.h / Processing.NDI.structs.h, NDI 5 and 6). The NDI library itself is
// loaded at run time with dlopen, so Church Studio builds and runs without it installed.

#include <stdbool.h>
#include <stdint.h>

typedef struct NDIlib_send_create_t {
  const char *p_ndi_name;
  const char *p_groups;
  bool clock_video;
  bool clock_audio;
} NDIlib_send_create_t;

typedef struct NDIlib_video_frame_v2_t {
  int xres;
  int yres;
  uint32_t FourCC;
  int frame_rate_N;
  int frame_rate_D;
  float picture_aspect_ratio;
  int frame_format_type;
  int64_t timecode;
  uint8_t *p_data;
  int line_stride_in_bytes;
  const char *p_metadata;
  int64_t timestamp;
} NDIlib_video_frame_v2_t;

typedef bool (*NDIlib_initialize_fn)(void);
typedef void (*NDIlib_destroy_fn)(void);
typedef const char *(*NDIlib_version_fn)(void);
typedef void *(*NDIlib_send_create_fn)(const NDIlib_send_create_t *settings);
typedef void (*NDIlib_send_destroy_fn)(void *instance);
typedef void (*NDIlib_send_send_video_v2_fn)(void *instance, const NDIlib_video_frame_v2_t *frame);
typedef int (*NDIlib_send_get_no_connections_fn)(void *instance, uint32_t timeout_ms);

/** 'B','G','R','A' as NDI's FourCC. */
static const uint32_t NDI_FOURCC_BGRA = (uint32_t)'B' | ((uint32_t)'G' << 8) | ((uint32_t)'R' << 16) | ((uint32_t)'A' << 24);
/** NDIlib_frame_format_type_progressive. */
static const int NDI_FRAME_PROGRESSIVE = 1;
/** NDIlib_send_timecode_synthesize: let NDI stamp the frame. */
static const int64_t NDI_TIMECODE_SYNTHESIZE = INT64_MAX;
