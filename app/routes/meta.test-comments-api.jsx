/**
 * Test Instagram Comments API Endpoint
 * 
 * This endpoint allows you to test Instagram Comments API calls
 * for Meta app review requirements.
 * 
 * Usage:
 * GET /meta/test-comments-api?mediaId={media-id}
 * GET /meta/test-comments-api?commentId={comment-id}
 * GET /meta/test-comments-api (lists posts and their comments)
 */

import { json } from "react-router";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuthWithRefresh, metaGraphAPI } from "../lib/meta.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);

  if (!shop?.id) {
    return json({ error: "Shop not found" }, { status: 401 });
  }

  const url = new URL(request.url);
  const mediaId = url.searchParams.get("mediaId");
  const commentId = url.searchParams.get("commentId");

  try {
    const auth = await getMetaAuthWithRefresh(shop.id);
    if (!auth || !auth.ig_business_id) {
      return json({ error: "Instagram not connected" }, { status: 400 });
    }

    if (!auth.page_access_token) {
      return json({ error: "No access token available" }, { status: 400 });
    }

    const results = {
      shopId: shop.id,
      igBusinessId: auth.ig_business_id,
      timestamp: new Date().toISOString(),
    };

    // Test 1: Get Instagram posts (media)
    if (!mediaId && !commentId) {
      try {
        const mediaResponse = await metaGraphAPI(
          `/${auth.ig_business_id}/media`,
          auth.page_access_token,
          {
            params: {
              fields: "id,caption,media_type,permalink,comments_count",
              limit: 5,
            },
          }
        );

        results.test1_getMedia = {
          success: true,
          endpoint: `GET /${auth.ig_business_id}/media`,
          data: mediaResponse.data || [],
          message: `Successfully fetched ${mediaResponse.data?.length || 0} Instagram posts`,
        };

        // For each post, try to get comments
        if (mediaResponse.data && mediaResponse.data.length > 0) {
          const firstPost = mediaResponse.data[0];
          try {
            const commentsResponse = await metaGraphAPI(
              `/${firstPost.id}/comments`,
              auth.page_access_token,
              {
                params: {
                  fields: "id,text,timestamp,from",
                },
              }
            );

            results.test2_getComments = {
              success: true,
              endpoint: `GET /${firstPost.id}/comments`,
              mediaId: firstPost.id,
              data: commentsResponse.data || [],
              message: `Successfully fetched ${commentsResponse.data?.length || 0} comments on post ${firstPost.id}`,
            };

            // If we have comments, get details of the first one
            if (commentsResponse.data && commentsResponse.data.length > 0) {
              const firstComment = commentsResponse.data[0];
              try {
                const commentDetailsResponse = await metaGraphAPI(
                  `/${firstComment.id}`,
                  auth.page_access_token,
                  {
                    params: {
                      fields: "id,text,timestamp,from",
                    },
                  }
                );

                results.test3_getCommentDetails = {
                  success: true,
                  endpoint: `GET /${firstComment.id}`,
                  commentId: firstComment.id,
                  data: commentDetailsResponse,
                  message: `Successfully fetched comment details for comment ${firstComment.id}`,
                };
              } catch (error) {
                results.test3_getCommentDetails = {
                  success: false,
                  endpoint: `GET /${firstComment.id}`,
                  error: error.message,
                  message: `Failed to get comment details: ${error.message}`,
                };
              }
            } else {
              results.test2_getComments.message += " (No comments found on this post)";
            }
          } catch (error) {
            results.test2_getComments = {
              success: false,
              endpoint: `GET /${firstPost.id}/comments`,
              error: error.message,
              message: `Failed to get comments: ${error.message}`,
            };
          }
        }
      } catch (error) {
        results.test1_getMedia = {
          success: false,
          endpoint: `GET /${auth.ig_business_id}/media`,
          error: error.message,
          message: `Failed to get Instagram posts: ${error.message}`,
        };
      }

      return json(results);
    }

    // Test 2: Get comments for a specific media ID
    if (mediaId) {
      try {
        const commentsResponse = await metaGraphAPI(
          `/${mediaId}/comments`,
          auth.page_access_token,
          {
            params: {
              fields: "id,text,timestamp,from",
            },
          }
        );

        return json({
          ...results,
          test_getComments: {
            success: true,
            endpoint: `GET /${mediaId}/comments`,
            mediaId: mediaId,
            data: commentsResponse.data || [],
            message: `Successfully fetched ${commentsResponse.data?.length || 0} comments`,
          },
        });
      } catch (error) {
        return json(
          {
            ...results,
            test_getComments: {
              success: false,
              endpoint: `GET /${mediaId}/comments`,
              error: error.message,
              message: `Failed to get comments: ${error.message}`,
            },
          },
          { status: 400 }
        );
      }
    }

    // Test 3: Get details for a specific comment ID
    if (commentId) {
      try {
        const commentResponse = await metaGraphAPI(
          `/${commentId}`,
          auth.page_access_token,
          {
            params: {
              fields: "id,text,timestamp,from",
            },
          }
        );

        return json({
          ...results,
          test_getCommentDetails: {
            success: true,
            endpoint: `GET /${commentId}`,
            commentId: commentId,
            data: commentResponse,
            message: `Successfully fetched comment details`,
          },
        });
      } catch (error) {
        return json(
          {
            ...results,
            test_getCommentDetails: {
              success: false,
              endpoint: `GET /${commentId}`,
              error: error.message,
              message: `Failed to get comment details: ${error.message}`,
            },
          },
          { status: 400 }
        );
      }
    }

    return json(results);
  } catch (error) {
    console.error("[test-comments-api] Error:", error);
    return json(
      {
        error: error.message || "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};
