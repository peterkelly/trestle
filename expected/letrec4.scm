(letrec
    ((a *unspecified*) (b *unspecified*) (c *unspecified*))
    (+
        1
        2
        (lambda (v0)
            (begin
                (set! a v0)
                (+
                    3
                    4
                    (lambda (v1)
                        (begin
                            (set! b v1)
                            (+
                                5
                                6
                                (lambda (v2)
                                    (begin
                                        (set! c v2)
                                        (+ a b c SUCC)))))))))))
